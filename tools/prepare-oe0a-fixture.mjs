import fs from 'node:fs';import path from 'node:path';import {deflateSync} from 'node:zlib';import {spawnSync} from 'node:child_process';
import {renderLayout} from '../lib/render-semantic.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.argv[2]??path.join(root,'output/oe0a-synthetic'));
if(fs.existsSync(out))throw Error('Choose a nonexistent fixture output');
fs.mkdirSync(out,{recursive:true});for(const d of ['components','layouts','vendor','public/media'])fs.mkdirSync(path.join(out,d),{recursive:true});
for(const f of fs.readdirSync(path.join(root,'template/components')))fs.copyFileSync(path.join(root,'template/components',f),path.join(out,'components',f));
for(const f of ['package.json','package-lock.json','vite.config.ts','install-slidev.mjs','start-slidev.ps1'])fs.copyFileSync(path.join(root,'template',f),path.join(out,f));
const meta=JSON.parse(fs.readFileSync(path.join(root,'template/studio-contract.json')));fs.copyFileSync(path.join(root,'template/vendor',`slidev-addon-studio-${meta.studioPackageVersion}.tgz`),path.join(out,'vendor',`slidev-addon-studio-${meta.studioPackageVersion}.tgz`));
fs.copyFileSync(path.join(root,'test/fixtures/oe0a/slides.md'),path.join(out,'slides.md'));fs.writeFileSync(path.join(out,'layouts/figma.vue'),renderLayout({x:1920,y:1080}));
const crc=buf=>{let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0};
const chunk=(type,data)=>{const t=Buffer.from(type),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([t,data])),b.length-4);return b};
const w=96,h=64,header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
const pixels=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w*3+1)+1+x*3;pixels[i]=x*2;pixels[i+1]=y*3;pixels[i+2]=180}
fs.writeFileSync(path.join(out,'public/media/synthetic.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
const video=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x96:rate=10','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'public/media/synthetic.mp4')],{encoding:'utf8'});if(video.status!==0)throw Error(video.stderr||String(video.error));
console.log(out);
