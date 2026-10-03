import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ZipArchive,detectMime} from '../lib/zip.mjs';
import {addStudioTextGuard,migrateLegacyPage} from '../lib/studio-migrate.mjs';
import {renderLayout,renderPage} from '../lib/render.mjs';
import {classifyScenes} from '../lib/classify.mjs';
import {renderPage as renderSemanticPage} from '../lib/render-semantic.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function tinyZip(name,contents){
  const data=Buffer.from(contents),filename=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(0,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(0,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+data.length,16);
  return Buffer.concat([local,filename,data,central,filename,end]);
}
test('ZIP rejects unsafe paths and detects tampered contents',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-zip-test-'));
  try{
    const bad=path.join(dir,'bad.zip');fs.writeFileSync(bad,tinyZip('../escape','x'));
    await assert.rejects(ZipArchive.open(bad),/Unsafe/);
    const corrupt=path.join(dir,'corrupt.zip');fs.writeFileSync(corrupt,tinyZip('safe','changed'));
    const z=await ZipArchive.open(corrupt);try{await assert.rejects(z.extract(z.byName.get('safe')),/CRC/);}finally{await z.close();}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('media is identified from bytes',()=>{
  assert.equal(detectMime(Buffer.from('89504e470d0a1a0a','hex')),'image/png');
  assert.equal(detectMime(Buffer.from('1a45dfa3','hex')),'video/webm');
  assert.equal(detectMime(Buffer.from('000000186674797061766966','hex')),'image/avif');
  assert.equal(detectMime(Buffer.from('000000186674797069736f6d','hex')),'video/mp4');
});
test('Studio migration keeps source text, media and notes while separating objects',()=>{
  const old='---\nlayout: figma\nfigmaSlideId: \'1:2\'\n---\n\n<SlideNavigation target="2">\n<div class="figma-stage" data-figma-slide-id="1:2" style="background:#000">\n  <!-- TEXT: Title -->\n  <div class="figma-text" data-figma-node-id="1:3" style="position:absolute;left:10px;height:20px;"><div class="figma-text-content" style="height:100%;color:red;">\n  <span>Original title</span>\n</div></div>\n  <!-- RECTANGLE: Photo -->\n  <div class="figma-media" data-figma-node-id="1:4" style="position:absolute;"><img src="/media/a.png" /></div>\n</div>\n</SlideNavigation>\n\n<!--\nSpeaker note\n-->\n';
  const next=migrateLegacyPage(old);
  assert.match(next,/figmaBackground: "#000"/);
  assert.match(next,/figmaNavTarget: 2/);
  assert.match(next,/<div class="figma-text" data-figma-name="Title"/);
  assert.match(next,/height:20px;color:red;/);
  assert.match(next,/Original title/);
  assert.match(next,/src="\/media\/a.png"/);
  assert.match(next,/Speaker note/);
  assert.doesNotMatch(next,/figma-text-content|SlideNavigation|figma-stage/);
  assert.equal(migrateLegacyPage(next),null);
});
test('Studio text boxes are not mistaken for editable group containers',()=>{
  const layout=renderLayout({x:1920,y:1080});
  assert.match(layout,/<span class="figma-studio-guard" aria-hidden="true"><\/span><slot \/>/);
  assert.match(layout,/\.figma-studio-guard \{display:none;\}/);
  const node=(id,children=[])=>({id,name:id,type:'GROUP',transform:{m00:1,m01:0,m02:0,m10:0,m11:1,m12:0},size:{x:100,y:100},visible:true,opacity:1,fill:null,children});
  const scene={id:'1:1',background:'#000',notes:{status:'empty'},children:[node('1:2',[node('1:3')])]};
  const page=renderPage(scene,new Map(),[]);
  assert.match(page,/<br class="figma-studio-guard" style="display:none" \/>/);
  const older=layout.replace('<span class="figma-studio-guard" aria-hidden="true"></span>','');
  const upgraded=addStudioTextGuard(older);
  assert.match(upgraded,/<span class="figma-studio-guard" aria-hidden="true" style="display:none"><\/span><slot \/>/);
  assert.equal(addStudioTextGuard(upgraded),null);
});
test('semantic classifier and renderer preserve typed text, media, and provenance',()=>{
  const I={m00:1,m01:0,m02:10,m10:0,m11:1,m12:20};
  const base=(id,type)=>({id,type,name:id,parentId:'1:1',position:'!',size:{x:200,y:90},transform:I,opacity:1,visible:true,fill:null,children:[],interactions:[]});
  const title={...base('1:2','TEXT'),text:'Hello\nworld',runs:[{text:'Hello\nworld',fontFamily:'Inter',fontSize:48,fontWeight:400,color:'#fff',decoration:'none'}],visualLines:null,fontFamily:'Inter',fontSize:48,fontWeight:400,color:'#fff',decoration:'none',lineHeight:{value:1,units:'RAW'},letterSpacing:{value:0,units:'PERCENT'},align:'CENTER',verticalAlign:'TOP'};
  const member='images/'+'a'.repeat(40),photo={...base('1:3','ROUNDED_RECTANGLE'),media:{kind:'image',hash:'a'.repeat(40),member,mode:'FIT',paintTransform:I,opacity:1},mediaLayers:[]};photo.mediaLayers=[photo.media];
  const s={id:'1:1',background:'#000',notes:{status:'empty'},children:[title,photo]};
  const archive=[{name:member,mime:'image/png',sha1:'a'.repeat(40),sha256:'b'.repeat(64),uncompressedSize:5}],assets=new Map([[member,{url:'/media/a.png'}]]),warnings=[];
  const manifest=classifyScenes([s],assets,archive,warnings);
  assert.deepEqual(manifest.records.map(r=>r.presentationKind),['text','image']);
  assert.equal(manifest.records[1].sourceEvidence.media[0].sha256,'b'.repeat(64));
  const page=renderSemanticPage(s,assets,warnings);
  assert.match(page,/<StudioText version="1" id="figma-1-2"/);
  assert.match(page,/<StudioParagraph>Hello<\/StudioParagraph><StudioParagraph>world<\/StudioParagraph><\/StudioText>/);
  assert.match(page,/<DeckImage[^>]*src="\/media\/a.png"/);
  assert.doesNotMatch(page,/<SceneSlide|<img src/);
  assert.deepEqual(warnings.map(w=>w.code),['resize-mode-fallback-fixed']);
});
test('generated package pins portable Studio fork with no node_modules patch hooks',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'template/package.json'),'utf8'));
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'template/studio-contract.json'),'utf8'));
  const tarball=`vendor/slidev-addon-studio-${metadata.studioPackageVersion}.tgz`;
  assert.equal(pkg.devDependencies['slidev-addon-studio'],`file:${tarball}`);
  assert.equal(pkg.scripts.predev,undefined);assert.equal(pkg.scripts.prebuild,undefined);
  assert.equal(fs.existsSync(path.join(root,'template/patch-studio.mjs')),false);
  assert.equal(fs.existsSync(path.join(root,'template',tarball)),true);
  const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(sha(path.join(root,'template',tarball)),metadata.studioTarballSha256);
  assert.equal(sha(path.join(root,'lib/structural-transaction.mjs')),metadata.structuralTransactionBundleSha256);
  assert.equal(sha(path.join(root,'lib/image-paint-contract.mjs')),metadata.imagePaintContractBundleSha256);
  assert.equal(metadata.imagePaintInspectionOnly,true);
});
test('public synthetic deck converts to an editable Slidev project',()=>{
  const fixture=path.join(root,'test/fixtures/public-minimal.deck');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'public-deck-test-'));
  try{
    const out=path.join(temp,'slidev');
    const result=spawnSync(process.execPath,[path.join(root,'bin/deck-to-slidev.mjs'),fixture,'--out',out,'--strict'],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const report=JSON.parse(fs.readFileSync(path.join(out,'conversion-report.json'),'utf8'));
    assert.deepEqual(report.slides,{active:1,generated:1,skipped:0});
    assert.equal(report.strictPassed,true);
    assert.equal(report.classificationCounts.shape,1);
    const page=fs.readFileSync(path.join(out,'pages/001.md'),'utf8');
    assert.match(page,/Synthetic shape/);
    assert.match(page,/<StudioLayer /);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
