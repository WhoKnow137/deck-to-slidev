import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable, Transform, Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createInflateRaw} from 'node:zlib';

const MAX_TAIL = 22 + 65535 + 20;
const crcTable = Uint32Array.from({length:256}, (_,i) => {
  let c=i; for(let j=0;j<8;j++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(crc,b) {for(const byte of b) crc=crcTable[(crc^byte)&255]^(crc>>>8); return crc>>>0;}
async function readAt(fh,offset,length) {
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0) throw Error('Invalid ZIP offset/length');
  const b=Buffer.alloc(length); let done=0;
  while(done<length){const {bytesRead}=await fh.read(b,done,length-done,offset+done);if(!bytesRead)throw Error('Truncated ZIP');done+=bytesRead;}
  return b;
}
function zip64Number(b,p) {const n=b.readBigUInt64LE(p);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('ZIP64 offset exceeds JS safe integer');return Number(n);}
function parseZip64Extra(extra,need) {
  let p=0;
  while(p+4<=extra.length){const id=extra.readUInt16LE(p),len=extra.readUInt16LE(p+2);p+=4;if(p+len>extra.length)throw Error('Truncated ZIP extra field');
    if(id===1){let q=p,out={};for(const k of ['uncompressed','compressed','localOffset'])if(need[k]){if(q+8>p+len)throw Error('Truncated ZIP64 extra');out[k]=zip64Number(extra,q);q+=8;}return out;}p+=len;
  }
  throw Error('Missing ZIP64 extra field');
}
export class ZipArchive {
  constructor(file,fh,size,entries){this.file=file;this.fh=fh;this.size=size;this.entries=entries;this.byName=new Map(entries.map(e=>[e.name,e]));}
  static async open(file,{maxEntries=100000,maxMember=8*1024**3}={}) {
    const fh=await fs.promises.open(file,'r');
    try {
      const size=(await fh.stat()).size, tail=await readAt(fh,Math.max(0,size-MAX_TAIL),Math.min(size,MAX_TAIL));
      let eocd=-1;for(let p=tail.length-22;p>=0;p--)if(tail.readUInt32LE(p)===0x06054b50&&p+22+tail.readUInt16LE(p+20)===tail.length){eocd=p;break;}
      if(eocd<0)throw Error('Not a ZIP archive: EOCD missing');
      let count=tail.readUInt16LE(eocd+10),cdSize=tail.readUInt32LE(eocd+12),cdOffset=tail.readUInt32LE(eocd+16);
      if(tail.readUInt16LE(eocd+4)||tail.readUInt16LE(eocd+6))throw Error('Multi-disk ZIP unsupported');
      if(count===65535||cdSize===0xffffffff||cdOffset===0xffffffff){
        const locOffset=size-tail.length+eocd-20,loc=await readAt(fh,locOffset,20);
        if(loc.readUInt32LE(0)!==0x07064b50)throw Error('ZIP64 locator missing');
        const z=await readAt(fh,zip64Number(loc,8),56);
        if(z.readUInt32LE(0)!==0x06064b50)throw Error('ZIP64 EOCD missing');
        count=zip64Number(z,32);cdSize=zip64Number(z,40);cdOffset=zip64Number(z,48);
      }
      if(count>maxEntries||cdSize>128*1024**2||cdOffset+cdSize>size)throw Error('ZIP central directory exceeds limits');
      const cd=await readAt(fh,cdOffset,cdSize), entries=[],names=new Set();let p=0;
      for(let i=0;i<count;i++){
        if(p+46>cd.length||cd.readUInt32LE(p)!==0x02014b50)throw Error(`Bad central directory entry ${i}`);
        const flags=cd.readUInt16LE(p+8),method=cd.readUInt16LE(p+10),crc=cd.readUInt32LE(p+16);
        let compressed=cd.readUInt32LE(p+20),uncompressed=cd.readUInt32LE(p+24),localOffset=cd.readUInt32LE(p+42);
        const nameLen=cd.readUInt16LE(p+28),extraLen=cd.readUInt16LE(p+30),commentLen=cd.readUInt16LE(p+32);
        const end=p+46+nameLen+extraLen+commentLen;if(end>cd.length)throw Error('Truncated central entry');
        if(flags&1)throw Error('Encrypted ZIP member unsupported');
        if(![0,8].includes(method))throw Error(`Unsupported ZIP method ${method}`);
        const name=cd.subarray(p+46,p+46+nameLen).toString('utf8');
        if(!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||name.split('/').some(s=>s==='..')||/^[A-Za-z]:/.test(name)||names.has(name))throw Error(`Unsafe/duplicate ZIP member: ${name}`);
        names.add(name);
        if(compressed===0xffffffff||uncompressed===0xffffffff||localOffset===0xffffffff){
          const x=parseZip64Extra(cd.subarray(p+46+nameLen,p+46+nameLen+extraLen),{uncompressed:uncompressed===0xffffffff,compressed:compressed===0xffffffff,localOffset:localOffset===0xffffffff});
          compressed=x.compressed??compressed;uncompressed=x.uncompressed??uncompressed;localOffset=x.localOffset??localOffset;
        }
        if(uncompressed>maxMember||localOffset>=size)throw Error(`ZIP member exceeds limits: ${name}`);
        entries.push({name,method,flags,crc,compressed,uncompressed,localOffset,directory:name.endsWith('/')});p=end;
      }
      if(p!==cd.length)throw Error('Unparsed ZIP central directory bytes');
      return new ZipArchive(file,fh,size,entries);
    }catch(e){await fh.close();throw e;}
  }
  async dataOffset(entry){const h=await readAt(this.fh,entry.localOffset,30);if(h.readUInt32LE(0)!==0x04034b50)throw Error(`Bad local header ${entry.name}`);
    if(h.readUInt16LE(8)!==entry.method)throw Error(`ZIP method mismatch ${entry.name}`);
    const offset=entry.localOffset+30+h.readUInt16LE(26)+h.readUInt16LE(28);
    if(offset+entry.compressed>this.size)throw Error(`ZIP member beyond end: ${entry.name}`);return offset;
  }
  async extract(entry,{to=null,buffer=false,bufferLimit=64*1024**2}={}){
    if(entry.directory)return {sha1:null,sha256:null,crc32:'00000000',size:0,magic:Buffer.alloc(0)};
    if(buffer&&entry.uncompressed>bufferLimit)throw Error(`Member too large for memory: ${entry.name}`);
    const offset=await this.dataOffset(entry), source=entry.compressed?fs.createReadStream(this.file,{start:offset,end:offset+entry.compressed-1}):Readable.from([]);
    const sha1=createHash('sha1'),sha256=createHash('sha256');let crc=0xffffffff,size=0,head=Buffer.alloc(0),chunks=[];
    const measure=new Transform({transform(chunk,enc,cb){size+=chunk.length;if(size>entry.uncompressed)return cb(Error(`ZIP size overflow: ${entry.name}`));sha1.update(chunk);sha256.update(chunk);crc=crc32(crc,chunk);if(head.length<64)head=Buffer.concat([head,chunk.subarray(0,64-head.length)]);if(buffer)chunks.push(chunk);cb(null,chunk);}});
    const sink=to?fs.createWriteStream(to,{flags:'wx'}):new Writable({write(chunk,enc,cb){cb();}});
    try{if(entry.method===8)await pipeline(source,createInflateRaw(),measure,sink);else await pipeline(source,measure,sink);}catch(e){if(to)await fs.promises.rm(to,{force:true}).catch(()=>{});throw e;}
    crc=(crc^0xffffffff)>>>0;if(size!==entry.uncompressed||crc!==entry.crc)throw Error(`ZIP CRC/size mismatch: ${entry.name}`);
    return {sha1:sha1.digest('hex'),sha256:sha256.digest('hex'),crc32:crc.toString(16).padStart(8,'0'),size,magic:head,bytes:buffer?Buffer.concat(chunks):undefined};
  }
  async close(){await this.fh.close();}
}
export function detectMime(b){if(b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return'image/png';
  if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return'image/jpeg';
  if(b.subarray(0,6).toString()==='GIF87a'||b.subarray(0,6).toString()==='GIF89a')return'image/gif';
  if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return'image/webp';
  if(b.subarray(0,4).equals(Buffer.from('1a45dfa3','hex')))return'video/webm';
  if(b.subarray(4,8).toString()==='ftyp'){const brand=b.subarray(8,12).toString();return /avif|avis/.test(brand)?'image/avif':/qt  /.test(brand)?'video/quicktime':'video/mp4';}
  if(b.subarray(0,8).toString()==='fig-deck')return'application/x-figma-kiwi-deck';
  if(b[0]===123||b[0]===91)return'application/json';return'application/octet-stream';}
export const extension={'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp','image/avif':'.avif','video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov'};
