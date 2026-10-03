// Public inspection fixture. Candidate modes are synthetic, never native goldens.
import fs from 'node:fs';import path from 'node:path';import {deflateSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {renderPage,renderLayout} from '../lib/render-semantic.mjs';import {layerProvenanceForPage} from '../lib/managed-layer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.argv[2]??path.join(root,'output/oe2-inspection'));
if(fs.existsSync(out))throw Error('Choose a nonexistent fixture output');
for(const dir of ['pages','components','layouts','vendor','public/media','data/slides'])fs.mkdirSync(path.join(out,dir),{recursive:true});
for(const file of fs.readdirSync(path.join(root,'template/components')))fs.copyFileSync(path.join(root,'template/components',file),path.join(out,'components',file));
for(const file of ['package.json','package-lock.json','vite.config.ts','install-slidev.mjs','start-slidev.ps1'])fs.copyFileSync(path.join(root,'template',file),path.join(out,file));
const meta=JSON.parse(fs.readFileSync(path.join(root,'template/studio-contract.json'))),tar=`slidev-addon-studio-${meta.studioPackageVersion}.tgz`;
fs.copyFileSync(path.join(root,'template/vendor',tar),path.join(out,'vendor',tar));
fs.copyFileSync(path.join(root,'template/studio-contract.json'),path.join(out,'data/studio-contract.json'));
const sha=(b,algo='sha256')=>createHash(algo).update(b).digest('hex');
const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0};
const chunk=(name,b)=>{const t=Buffer.from(name),h=Buffer.alloc(4),c=Buffer.alloc(4);h.writeUInt32BE(b.length);c.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([h,t,b,c])};
const png=(w,h)=>{const raw=Buffer.alloc(h*(1+w*4));for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const color=y<h/2?(x<w/2?[255,60,60]:[30,210,50]):(x<w/2?[40,80,255]:[245,205,20]);
 if(x%50===0||y%50===0)color.fill(30);if(x>30&&x<70&&y>50&&y<90)color.splice(0,3,255,0,255);
 raw.set([...color,255],y*(1+w*4)+1+x*4)}const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ih),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])};
const inputs=[png(400,300),png(300,400)],assets=new Map();inputs.forEach((bytes,i)=>{const hash=sha(bytes,'sha1'),url=`/media/grid-${i}.png`;
 fs.writeFileSync(path.join(out,'public',url),bytes);assets.set(`images/${hash}`,{name:`images/${hash}`,url,sha256:sha(bytes),sha1:hash,mime:'image/png',uncompressedSize:bytes.length})});
const cases=['Fill candidate','Fit candidate','Crop candidate','Tile candidate','Rotated crop candidate','Independent corners candidate',
 'Separate opacity domains','Image plus overlay stack','Shared placement','Different aspect replacement candidate'];
const identity={m00:1,m01:0,m02:0,m10:0,m11:1,m12:0},rows=[],provenance=[];
for(let i=0;i<cases.length;i++){
 const id=`synthetic-slide-${i+1}`,number=String(i+1).padStart(3,'0'),asset=[...assets.values()][i===9?1:0],mode=i===1?'FIT':[2,4,5].includes(i)?'STRETCH':i===3?'TILE':'FILL';
 const transform=[2,4,5].includes(i)?{...identity,m00:.8,m11:.8,m02:.1,m12:.1,...(i===4?{m01:.2,m10:-.2}:{})}:identity;
 const raw={type:'IMAGE',imageScaleMode:mode,transform,opacity:i===6?.4:1,visible:true,originalImageWidth:i===9?300:400,originalImageHeight:i===9?400:300,image:{hash:asset.sha1}};
 const layer={opacity:i===6?.5:1,...(i===5?{rectangleCornerRadiiIndependent:true,rectangleTopLeftCornerRadius:4,rectangleTopRightCornerRadius:8,rectangleBottomRightCornerRadius:12,rectangleBottomLeftCornerRadius:16}:{cornerRadius:0})};
 const paints=i===7?[raw,{type:'SOLID',opacity:.3,color:{r:1,g:0,b:0,a:1},unknownOverlayOrder:true}]:[raw];
 const n={id:`synthetic-image-${i+1}`,name:cases[i],type:'RECTANGLE',presentationKind:'image',transform:{...identity,m02:300,m12:260},
  size:{x:800,y:400},opacity:layer.opacity,visible:true,children:[],media:{kind:'image',hash:asset.sha1,member:asset.name,mode,paintTransform:transform,opacity:raw.opacity,source:{path:'fillPaints[0]',rawPaint:raw}},
  mediaSourceEvidence:{scope:'synthetic',orderedPaints:paints,layer}};
 const shared={...structuredClone(n),id:'synthetic-image-shared-second',name:'Shared resource second placement',
  transform:{...identity,m02:1150,m12:260},size:{x:500,y:400}};
 const scene={id,background:'#111111',children:i===8?[n,shared]:[n],notes:{status:'present',blocks:[{text:'Public synthetic inspection fixture; candidate states are not native Figma evidence.'}]}},page=`pages/${number}.md`;
 fs.writeFileSync(path.join(out,page),renderPage(scene,assets,[]));provenance.push(...layerProvenanceForPage(scene,fs.readFileSync(path.join(out,page),'utf8'),page));
 const data=`data/slides/${number}`;fs.mkdirSync(path.join(out,data),{recursive:true});for(const [name,value]of Object.entries({'scene.json':scene,'notes.json':scene.notes,'media.json':{slideId:id,placements:[]}}))fs.writeFileSync(path.join(out,data,name),JSON.stringify(value,null,2)+'\n');
 rows.push({id,page,data,label:cases[i],skipped:false,order:i+1,notesStatus:'present'});
}
const save=(file,value)=>fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2)+'\n');
save('data/slides/index.json',rows);save('data/assets.json',[...assets.values()]);save('data/layer-provenance.json',{schemaVersion:1,objects:provenance});save('data/conversion-provenance.json',{schemaVersion:1,objects:[]});
save('data/fixture-scope.json',{scope:'synthetic-only',nativeGoldens:false,cases,mutations:'BLOCKED',inputs:[...assets.values()]});
fs.writeFileSync(path.join(out,'slides.md'),`---\ntitle: Image paint inspection — synthetic, no native parity\ncanvasWidth: 1920\naspectRatio: 16/9\nsrc: ./${rows[0].page}\n---\n\n${rows.slice(1).map(r=>`---\nsrc: ./${r.page}\n---`).join('\n\n')}\n`);
fs.writeFileSync(path.join(out,'layouts/figma.vue'),renderLayout({x:1920,y:1080}));console.log(JSON.stringify({out,slides:rows.length,scope:'synthetic-only',mutations:'BLOCKED'}));
