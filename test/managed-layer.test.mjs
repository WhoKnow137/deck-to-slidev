import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {analyzeLayer,layerId,layerProvenanceForPage} from '../lib/managed-layer.mjs';
import {renderPage} from '../lib/render-semantic.mjs';
import {regenerateLayers} from '../lib/regenerate-layers.mjs';
import {managedLayerSpans,parseManagedLayer,applyLayerGeometry,patchLayerGeometrySource} from '../lib/layer-contract.mjs';
const node=(id='1:2')=>({id,name:'Public synthetic',type:'RECTANGLE',presentationKind:'image',transform:{m00:1,m01:0,m02:20,m10:0,m11:1,m12:30},size:{x:200,y:120},opacity:1,visible:true,children:[],media:{member:'images/public',kind:'image',mode:'STRETCH',opacity:1,paintTransform:{m00:.8,m01:0,m02:.1,m10:0,m11:1,m12:0}}});
const scene=n=>({id:'1:1',background:'#fff',children:n,notes:{status:'present',blocks:[{text:'Synthetic note'}]}});
const assets=new Map([['images/public',{url:'/public.png'}]]);
test('stable source identities survive geometry/name/order changes and include slide/instance context',()=>{
  const n=node(),a=analyzeLayer(n,'1:1'),b=analyzeLayer({...n,name:'Renamed',transform:{...n.transform,m02:999}},'1:1');assert.equal(a.id,b.id);assert.notEqual(a.id,analyzeLayer(n,'2:1').id);assert.notEqual(layerId('1:1','2:3/1:2'),layerId('1:1','4:5/1:2'));
  assert.equal(analyzeLayer(n,'1:1',{duplicate:true}).managed,false);assert.equal(analyzeLayer({...n,transform:{...n.transform,m01:.2}},'1:1').capabilities.level,'READ_ONLY');
  assert.equal(analyzeLayer({...n,size:{x:0.0000001,y:120}},'1:1').managed,false);
  assert.equal(analyzeLayer({...n,transform:{m00:1,m11:1,m02:20,m12:30}},'1:1').managed,false);
  const ambiguous=renderPage(scene([n,{...n}]),assets,[]);
  assert.equal(managedLayerSpans(ambiguous).length,0);
  assert.equal((ambiguous.match(/data-studio-render-only="duplicate-source-identity"/g)??[]).length,2);
});
test('managed source keeps media paint bytes and canonical geometry, with conservative family capabilities',()=>{
  const n=node(),page=renderPage(scene([n]),assets,[]),span=managedLayerSpans(page)[0],m=parseManagedLayer(span.source),changed=patchLayerGeometrySource(span.source,m,applyLayerGeometry(m,{kind:'set',property:'width',value:300}));
  assert.equal(m.geometry.x,20);assert.equal(m.geometry.y,30);assert.equal(changed.slice(changed.indexOf('<DeckImage')),span.source.slice(span.source.indexOf('<DeckImage')));
  for(const [kind,type] of [['shape','SHAPE_WITH_TEXT'],['vector','VECTOR'],['container','FRAME'],['container','INSTANCE']])assert.equal(analyzeLayer({...n,media:null,presentationKind:kind,type},'1:1').capabilities.level,'POSITION_ONLY');
});
test('M4 layer regeneration preserves local geometry, regenerates untouched input, conflicts, deletions and removals',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oe0a-converter-'));try{
    fs.mkdirSync(path.join(dir,'data/slides'),{recursive:true});fs.mkdirSync(path.join(dir,'pages'));
    const n=node(),s=scene([n]),page=renderPage(s,assets,[]),file=path.join(dir,'pages/001.md'),manifest=path.join(dir,'data/layer-provenance.json');
    const setup=()=>{fs.writeFileSync(file,page);fs.writeFileSync(manifest,JSON.stringify({schemaVersion:1,objects:layerProvenanceForPage(s,page,'pages/001.md')}));};
    fs.writeFileSync(path.join(dir,'data/slides/index.json'),JSON.stringify([{id:s.id,page:'pages/001.md'}]));setup();
    assert.equal(regenerateLayers({out:dir,scenes:[s],assets}).counts.unchanged,1);
    const edited=page.replace('pos="20,30,200,120"','pos="45,30,200,120"');fs.writeFileSync(file,edited);
    assert.equal(regenerateLayers({out:dir,scenes:[s],assets}).counts['locally-modified-preserved'],1);assert.equal(fs.readFileSync(file,'utf8'),edited);
    const updated=scene([{...n,transform:{...n.transform,m02:60}}]);assert.equal(regenerateLayers({out:dir,scenes:[updated],assets}).counts['source-and-local-conflict'],1);assert.equal(fs.readFileSync(file,'utf8'),edited);
    setup();assert.equal(regenerateLayers({out:dir,scenes:[updated],assets}).counts.regenerated,1);assert.ok(fs.readFileSync(file,'utf8').includes('pos="60,30,200,120"'));
    setup();const span=managedLayerSpans(page)[0],deleted=page.slice(0,span.start)+page.slice(span.end);fs.writeFileSync(file,deleted);assert.equal(regenerateLayers({out:dir,scenes:[s],assets}).counts['locally-deleted'],1);assert.equal(fs.readFileSync(file,'utf8'),deleted);
    setup();assert.equal(regenerateLayers({out:dir,scenes:[scene([])],assets}).counts['source-removed'],1);assert.equal(fs.readFileSync(file,'utf8'),page);
    setup();fs.writeFileSync(file,page+'\n'+span.source);assert.equal(regenerateLayers({out:dir,scenes:[s],assets}).counts.error,1);assert.equal(fs.readFileSync(file,'utf8'),page+'\n'+span.source);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('M6 local structural layer changes are not regenerated or silently resurrected',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m6-layer-rerun-'));try{
    fs.mkdirSync(path.join(dir,'data/slides'),{recursive:true});fs.mkdirSync(path.join(dir,'pages'));
    const n=node(),s=scene([n]),page=renderPage(s,assets,[]),span=managedLayerSpans(page)[0],file=path.join(dir,'pages/001.md');
    fs.writeFileSync(file,page.slice(0,span.start)+page.slice(span.end));
    fs.writeFileSync(path.join(dir,'data/slides/index.json'),JSON.stringify([{id:s.id,page:'pages/001.md'}]));
    fs.writeFileSync(path.join(dir,'data/layer-provenance.json'),JSON.stringify({schemaVersion:1,objects:layerProvenanceForPage(s,page,'pages/001.md')}));
    fs.writeFileSync(path.join(dir,'data/structural-provenance.json'),JSON.stringify({schemaVersion:1,nextId:2,
      objects:{[span.id]:{origin:'imported',state:'deleted',sourceSlideId:s.id,currentSlideId:null,sourceFile:'pages/001.md'}},slides:{}}));
    const local=fs.readFileSync(file,'utf8');
    assert.equal(regenerateLayers({out:dir,scenes:[s],assets}).counts['local-structural-preserved'],1);assert.equal(fs.readFileSync(file,'utf8'),local);
    const changed=scene([{...n,transform:{...n.transform,m02:77}}]);
    assert.equal(regenerateLayers({out:dir,scenes:[changed],assets}).counts['source-and-local-structural-conflict'],1);assert.equal(fs.readFileSync(file,'utf8'),local);
    assert.equal(regenerateLayers({out:dir,scenes:[scene([])],assets}).counts['source-removed-local-structural-conflict'],1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'data/structural-provenance.json'))).objects[span.id].sourceRemoved,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
