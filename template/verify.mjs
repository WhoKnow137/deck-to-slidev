import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const report=read('conversion-report.json'),assets=read('data/assets.json'),archive=read('data/archive.json'),slideIndex=read('data/slides/index.json'),classification=read('data/classification.json');
const provenance=read('data/conversion-provenance.json'),studioByNode=new Map(provenance.objects.map(row=>[row.figmaNodeId,row.studioId]));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const slidesMd=fs.readFileSync(path.join(root,'slides.md'),'utf8');
let text=0,media=0,notes=0;
if(slideIndex.length!==report.slides.generated+report.slides.skipped)throw Error('Slide index length mismatch');
if(classification.schemaVersion!==1)throw Error('Classification schema mismatch');
const classified=new Map(classification.records.map(r=>[r.nodeId,r]));
if(classified.size!==classification.records.length)throw Error('Duplicate classified node ID');
for(let i=1;i<=report.slides.generated;i++){
  const id=String(i).padStart(3,'0'),scene=read(`data/slides/${id}/scene.json`),note=read(`data/slides/${id}/notes.json`),page=fs.readFileSync(path.join(root,'pages',`${id}.md`),'utf8');
  if(slideIndex[i-1]?.id!==scene.id||slideIndex[i-1]?.page!==`pages/${id}.md`)throw Error(`Slide index mismatch ${id}`);
  if(!slidesMd.includes(`./pages/${id}.md`))throw Error(`Slide ${id} is absent from slides.md`);
  const sourceSlideId=page.match(/^figmaSlideId:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
  if(sourceSlideId!==scene.id||page.includes('<SceneSlide'))throw Error(`Missing direct slide source ${id}`);
  const walk=n=>{const record=classified.get(n.id);if(!record||record.slideId!==scene.id||record.sourceNodeType!==n.type||record.presentationKind!==n.presentationKind)throw Error(`Classification mismatch ${n.id}`);const studioId=studioByNode.get(n.id);if(!page.includes(`data-figma-node-id="${n.id}"`)&&!(studioId&&page.includes(`id="${studioId}"`)))throw Error(`Missing node ${n.id}`);if(n.runs){text++;if(studioId){if(!page.includes(`<StudioText version="1" id="${studioId}"`))throw Error(`StudioText component missing ${n.id}`);}else{const sample=(n.visualLines?.find(l=>l.text.trim())?.text??n.runs.find(r=>r.text.trim())?.text??'').split(/[\r\n]/).find(Boolean)?.trim().slice(0,15)??'';if(sample&&!page.includes(escape(sample)))throw Error(`Missing text for ${n.id}`);}}if(n.media){media++;const evidence=record.sourceEvidence.media.at(-1);if(!evidence||evidence.hash!==n.media.hash||evidence.archiveMember!==n.media.member)throw Error(`Media classification mismatch ${n.id}`);}n.children.forEach(walk);};scene.children.forEach(walk);
  if(note.status==='present'){notes++;if(!page.includes('<!--')||!page.includes(escape(note.blocks.find(b=>b.text.trim())?.text.slice(0,15)??'')))throw Error(`Missing notes ${id}`);}
}
for(let i=1;i<=report.slides.skipped;i++)if(!fs.existsSync(path.join(root,'pages','skipped',`${String(i).padStart(3,'0')}.md`)))throw Error(`Missing skipped source ${i}`);
const canvas=archive.find(a=>a.name==='canvas.fig');if(!canvas)throw Error('canvas.fig archive record missing');
const canvasBytes=fs.readFileSync(path.join(root,'data','canvas.fig'));
if(createHash('sha256').update(canvasBytes).digest('hex')!==canvas.sha256)throw Error('Stored Kiwi payload changed');
for(const a of assets){const p=path.join(root,'public','media',a.filename);if(!fs.existsSync(p))throw Error(`Missing ${p}`);
  const hash=createHash('sha256');for await(const b of fs.createReadStream(p))hash.update(b);
  if(hash.digest('hex')!==a.sha256||fs.statSync(p).size!==a.uncompressedSize)throw Error(`Media bytes changed: ${a.filename}`);
  const built=path.join(root,'dist','media',a.filename);if(fs.existsSync(path.join(root,'dist'))&&(!fs.existsSync(built)||fs.statSync(built).size!==a.uncompressedSize))throw Error(`Built media missing or changed size: ${a.filename}`);
}
console.log(JSON.stringify({slides:report.slides.generated,text,media,notes,assets:assets.length,assetBytes:report.assetBytes,hashes:'match'},null,2));
