// Local forensic validation only. No writes to the source deck or presentation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {studioTextSpans} from '../lib/studio-contract.mjs';
import {managedLayerSpans,parseManagedLayer} from '../lib/layer-contract.mjs';
import {renderPage,renderLayout} from '../lib/render-semantic.mjs';
import {layerProvenanceForPage} from '../lib/managed-layer.mjs';

const [project,repeat,baseline,evidence,deck]=process.argv.slice(2).map(p=>path.resolve(p));
if(!deck)throw Error('Usage: edited-project fresh-project accepted-baseline evidence-dir source.deck');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const bytes=(root,name)=>fs.readFileSync(path.join(root,name));
const sha=b=>createHash('sha256').update(b).digest('hex');
const hashFile=async p=>{const h=createHash('sha256');for await(const chunk of fs.createReadStream(p))h.update(chunk);return h.digest('hex');};
const metadata=json(path.join(project,'data/converter-metadata.json'));
assert.deepEqual(metadata,json(path.join(repeat,'data/converter-metadata.json')));
const tar=`vendor/slidev-addon-studio-${metadata.studioPackageVersion}.tgz`;
assert.equal(sha(bytes(project,tar)),metadata.studioTarballSha256);
assert.deepEqual(bytes(project,tar),bytes(repeat,tar));
assert.deepEqual(bytes(project,'package.json'),bytes(repeat,'package.json'));
assert.deepEqual(bytes(project,'package-lock.json'),bytes(repeat,'package-lock.json'));

const index=json(path.join(project,'data/slides/index.json'));
const assetMap=new Map(json(path.join(repeat,'data/assets.json')).map(a=>[a.name,a]));
const activeIndex=new Map(index.filter(r=>!r.skipped).map(r=>[r.id,r.order]));
const currentProvenance=[];
assert.deepEqual(bytes(project,'data/slides/index.json'),bytes(baseline,'data/slides/index.json'));
let text=0,fallback=0,svg=0,media=0,notes=0,scenes=0;
const appearances=[];
for(const row of index){
  const fresh=bytes(repeat,row.page).toString('utf8'),prior=bytes(baseline,row.page).toString('utf8');
  const sourceScene={...json(path.join(repeat,row.data,'scene.json')),notes:json(path.join(repeat,row.data,'notes.json'))};
  const nav=sourceScene.interactions.find(a=>a.action==='NAVIGATE'&&a.event==='ON_CLICK');
  const target=row.skipped?null:nav?.targetId?activeIndex.get(nav.targetId)??null:null;
  const rendered=renderPage(sourceScene,assetMap,[],target);
  assert.equal(rendered,fresh,'Final converter source changed: '+row.page);
  assert.equal(renderPage(structuredClone(sourceScene),assetMap,[],target),rendered,'Nondeterministic final render');
  currentProvenance.push(...layerProvenanceForPage(sourceScene,rendered,row.page));
  assert.equal(fresh.split('<!-- figma-managed-insert -->')[1],prior.split('<!-- figma-managed-insert -->')[1]);notes++;
  assert.deepEqual(bytes(project,path.join(row.data,'notes.json')),bytes(baseline,path.join(row.data,'notes.json')));
  assert.deepEqual(bytes(repeat,path.join(row.data,'scene.json')),bytes(baseline,path.join(row.data,'scene.json')));scenes++;
  const a=studioTextSpans(fresh),b=studioTextSpans(prior);assert.deepEqual(a.map(s=>s.source),b.map(s=>s.source));text+=a.length;
  const fall=s=>s.match(/<div class="figma-text figma-text-fallback"[^>]*>[\s\S]*?<\/div>/g)??[];
  assert.deepEqual(fall(fresh),fall(prior));fallback+=fall(fresh).length;
  const svgs=s=>s.match(/<svg\b[\s\S]*?<\/svg>/g)??[];
  assert.deepEqual(svgs(fresh),svgs(prior));svg+=svgs(fresh).length;
  const mediaTags=s=>(s.match(/<Deck(?:Image|Video)\b[^>]*\/>/g)??[]).map(t=>t.replace(/ style="[^"]*"/,''));
  assert.deepEqual(mediaTags(fresh),mediaTags(prior));media+=mediaTags(fresh).length;
  for(const span of managedLayerSpans(fresh)){
    const layer=parseManagedLayer(span.source),g=layer.geometry;
    const scene=json(path.join(repeat,row.data,'scene.json')),node=scene.children.find(n=>n.id===layer.source.figmaGuid);assert.ok(node);
    if(layer.capabilities.level==='READ_ONLY')continue;
    const theta=g.rotationDeg*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),cx=g.x+g.width/2,cy=g.y+g.height/2;
    const error=Math.max(...[[0,0],[g.width,0],[0,g.height],[g.width,g.height]].flatMap(([x,y])=>{
      const px=cx+c*(x-g.width/2)-s*(y-g.height/2),py=cy+s*(x-g.width/2)+c*(y-g.height/2),m=node.transform;
      return [Math.abs(px-(m.m00*x+m.m01*y+m.m02)),Math.abs(py-(m.m10*x+m.m11*y+m.m12))];
    }));
    assert.ok(error<0.001,`Layer/source transform mismatch: ${layer.id}: ${error}`);
    appearances.push({id:layer.id,maxCornerError:error});
  }
}
assert.equal(text,194);assert.equal(fallback,17);
currentProvenance.sort((a,b)=>a.sourceFile.localeCompare(b.sourceFile)||a.objectId.localeCompare(b.objectId));
assert.deepEqual(currentProvenance,json(path.join(repeat,'data/layer-provenance.json')).objects);
assert.equal(renderLayout(json(path.join(repeat,'conversion-report.json')).canvas),bytes(repeat,'layouts/figma.vue').toString('utf8'));
const before=fs.readFileSync(path.join(evidence,'private-move-before.md'),'utf8'),after=fs.readFileSync(path.join(evidence,'private-move-after.md'),'utf8');
assert.equal(after,before.replace('pos="885,0,996,1080"','pos="905,10,996,1080"'));
assert.equal(bytes(project,'pages/001.md').toString('utf8'),after);
assert.equal(bytes(repeat,'pages/001.md').toString('utf8'),before);
for(const row of index)if(row.page!=='pages/001.md')assert.deepEqual(bytes(project,row.page),bytes(repeat,row.page));
const assets=json(path.join(project,'data/assets.json')),directories=[];
for(const dir of ['public','dist','dist-plain']){
  for(const a of assets){const file=path.join(project,dir,'media',a.filename);assert.equal(fs.statSync(file).size,a.uncompressedSize);assert.equal(await hashFile(file),a.sha256);}
  directories.push({directory:dir,byteIdenticalResources:assets.length,bytes:assets.reduce((s,a)=>s+a.uncompressedSize,0)});
}
const source=json(path.join(project,'conversion-report.json')).source;
assert.equal(await hashFile(deck),source.sha256);assert.equal(fs.statSync(deck).size,source.size);
const canvas=json(path.join(project,'data/archive.json')).find(e=>e.name==='canvas.fig');assert.equal(await hashFile(path.join(project,'data/canvas.fig')),canvas.sha256);
const result={privateEvidence:true,source,canvasSha256:canvas.sha256,package:metadata,finalGenerator:{pagesReproduced:notes,independentRendersIdentical:true,layerProvenanceIdentical:currentProvenance.length,layoutIdentical:true},appearance:{notesByteIdentical:notes,scenesByteIdentical:scenes,studioTextByteIdentical:text,fallbackByteIdentical:fallback,svgSubtreesByteIdentical:svg,mediaNonframeAttributesByteIdentical:media,managedCornerChecks:appearances.length,maxCornerError:Math.max(...appearances.map(a=>a.maxCornerError))},privateMove:{onlyGeometry:true,otherPagesIdentical:index.length-1,exactRerunPreserved:true},resources:directories};
fs.writeFileSync(path.join(evidence,'final-integrity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
