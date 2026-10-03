import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {imagePaintEvidence} from '../lib/image-paint-evidence.mjs';
import {renderPage} from '../lib/render-semantic.mjs';
import {layerProvenanceForPage} from '../lib/managed-layer.mjs';
import {managedLayerSpans,parseManagedLayer} from '../lib/layer-contract.mjs';
import {regenerateLayers} from '../lib/regenerate-layers.mjs';
const raw={type:'IMAGE',imageScaleMode:'STRETCH',transform:{m00:.8,m01:0,m02:.1,m10:0,m11:1,m12:0},
 originalImageWidth:400,originalImageHeight:300,opacity:.4,image:{hash:[1,2]},unknownField:{values:['keep',null]}};
const node=()=>({id:'1:2',name:'Synthetic image',type:'RECTANGLE',presentationKind:'image',size:{x:200,y:100},
 transform:{m00:1,m01:0,m02:20,m10:0,m11:1,m12:30},opacity:.5,visible:true,children:[],
 media:{kind:'image',hash:'0102',member:'images/0102',mode:'STRETCH',paintTransform:raw.transform,opacity:.4,
   source:{path:'fillPaints[0]',rawPaint:raw}},mediaSourceEvidence:{orderedPaints:[raw],layer:{opacity:.5,cornerRadius:8,futureEffect:42}}});
const assets=new Map([['images/0102',{url:'/media/shared.png',sha256:'a'.repeat(64)}]]);
const scene=n=>({id:'1:1',background:'#000',children:n,notes:{status:'present',blocks:[{text:'Synthetic notes'}]}});
test('image evidence preserves unknown fields and separates resource bytes, private matrix and render projection',()=>{
 const n=node(),e=imagePaintEvidence(n,assets),page=renderPage(scene([n]),assets,[]),span=managedLayerSpans(page)[0],m=parseManagedLayer(span.source);
 assert.deepEqual(e.orderedPaints,[raw]);assert.deepEqual(m.paintInspection.evidence,e);
 assert.equal(m.paintInspection.mode,'unknown');assert.equal(m.paintInspection.writable,false);
 assert.equal(e.placements[0].resource.sha256,'a'.repeat(64));assert.equal(e.placements[0].resource.sourceHash,'0102');
 assert.equal(m.paintInspection.images[0].paintOpacity,.4);assert.equal(e.layer.opacity,.5);
 assert.equal(layerProvenanceForPage(scene([n]),page,'pages/001.md')[0].paintOwnership,'inspection-only');
 assert.ok(page.includes('Synthetic notes'));assert.equal(page,renderPage(scene([n]),assets,[]));
});
test('manual paint changes follow conservative rerun ownership and source removal policy',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'oe2-inspect-rerun-'));try{
 fs.mkdirSync(path.join(out,'pages'));fs.mkdirSync(path.join(out,'data/slides'),{recursive:true});
 const n=node(),s=scene([n]),page=renderPage(s,assets,[]),file=path.join(out,'pages/001.md');
 const setup=()=>{fs.rmSync(path.join(out,'data/structural-provenance.json'),{force:true});fs.writeFileSync(file,page);fs.writeFileSync(path.join(out,'data/layer-provenance.json'),JSON.stringify({schemaVersion:1,objects:layerProvenanceForPage(s,page,'pages/001.md')}));};
 fs.writeFileSync(path.join(out,'data/slides/index.json'),JSON.stringify([{id:s.id,page:'pages/001.md'}]));setup();
 const changed={...n,mediaSourceEvidence:{...n.mediaSourceEvidence,orderedPaints:[{...raw,unknownField:{new:42}}]}};
 assert.equal(regenerateLayers({out,scenes:[scene([changed])],assets}).counts.regenerated,1);
 setup();const local=page.replace('&quot;keep&quot;','&quot;manual-local-edit&quot;');assert.notEqual(local,page);fs.writeFileSync(file,local);
 assert.equal(regenerateLayers({out,scenes:[s],assets}).counts['locally-modified-preserved'],1);assert.equal(fs.readFileSync(file,'utf8'),local);
 assert.equal(regenerateLayers({out,scenes:[scene([changed])],assets}).counts['source-and-local-conflict'],1);assert.equal(fs.readFileSync(file,'utf8'),local);
 assert.equal(regenerateLayers({out,scenes:[scene([])],assets}).counts['source-removed'],1);assert.equal(fs.readFileSync(file,'utf8'),local);
 setup();fs.writeFileSync(file,'<!-- deleted owner; notes retained -->');
 assert.equal(regenerateLayers({out,scenes:[s],assets}).counts['locally-deleted'],1);assert.equal(fs.readFileSync(file,'utf8'),'<!-- deleted owner; notes retained -->');
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
