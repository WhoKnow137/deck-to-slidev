import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generatedAppearance,decodeAppearanceGeometry,linearGradientProjection,mediaCorners,mediaProjection} from '../lib/appearance.mjs';
import {buildScenes} from '../lib/scene.mjs';
import {classifyScenes} from '../lib/classify.mjs';
import {renderPage} from '../lib/render-semantic.mjs';

const I={m00:1,m01:0,m02:0,m10:0,m11:1,m12:0};
const guid=(localID,sessionID=17)=>({sessionID,localID});
const address={guids:[guid(71),guid(9,23)]};
const color={r:0.12,g:0.25,b:0.5,a:0.8};
function commands(items){return Uint8Array.from(items.flatMap(([cmd,...coords])=>{const b=Buffer.alloc(1+4*coords.length);b[0]=cmd;coords.forEach((v,i)=>b.writeFloatLE(v,1+i*4));return [...b];}));}
const curve=commands([[1,0,0],[4,10,0,15,20,30,40],[2,0,40],[0]]);
function sample(paint={type:'SOLID',color,opacity:0.47,visible:true}){
  const node={type:'SHAPE_WITH_TEXT',guid:guid(44),name:'Public synthetic shape',size:{x:30,y:40},transform:I,opacity:0.6,
    nodeGenerationData:{extraEvidence:'preserve',overrides:[{guidPath:{guids:[guid(12),guid(9,23)]},fillPaints:[{type:'SOLID',color:{r:1,g:1,b:1,a:1}}],fontSize:16},{guidPath:address,fillPaints:[paint],opacity:0.9,cornerRadius:0}]},
    derivedImmutableFrameData:{version:1,overrides:[{guidPath:address,size:{x:30,y:40},transform:I,fillGeometry:[{commandsBlob:0,windingRule:'NONZERO',styleID:0}]},{guidPath:{guids:[guid(12),guid(9,23)]},derivedTextData:{layoutSize:{x:30,y:20}}}]}};
  return {node,doc:{message:{blobs:[{bytes:curve}]}},warnings:[]};
}
function converted(paint){const s=sample(paint);return {...s,appearance:generatedAppearance(s.doc,s.node,s.warnings)};}
function page(s){const n={id:'17:44',type:s.node.type,name:s.node.name,parentId:'17:1',position:'a',size:s.node.size,transform:I,opacity:s.node.opacity,visible:true,children:[],appearance:s.appearance};
  const scene={id:'17:1',background:'#000',notes:{status:'empty'},children:[n]},warnings=[];
  classifyScenes([scene],new Map(),[],warnings);return {node:n,source:renderPage(scene,new Map(),warnings),warnings};}

test('generated solid shape preserves separate RGBA, paint/layer opacity, both domains and complete source addressing',()=>{
  const s=converted(),p=s.appearance.parts[0],f=p.fills[0];
  assert.equal(s.warnings.length,0);assert.equal(s.appearance.parts.length,1);
  assert.equal(s.appearance.sourceNodeType,'SHAPE_WITH_TEXT');assert.equal(s.appearance.sourceNodeId,'17:44');
  assert.deepEqual(s.appearance.sourceDomains.nodeGenerationData,s.node.nodeGenerationData);
  assert.deepEqual(s.appearance.sourceDomains.derivedImmutableFrameData,s.node.derivedImmutableFrameData);
  assert.deepEqual(p.source.parentSourceGuid,guid(44));assert.deepEqual(p.source.guidPath,address);
  assert.deepEqual(p.source.records,[{domain:'nodeGenerationData',path:'nodeGenerationData.overrides[1]'},{domain:'derivedImmutableFrameData',path:'derivedImmutableFrameData.overrides[0]'}]);
  assert.deepEqual(f.color,color);assert.equal(f.opacity,0.47);assert.equal(p.opacity,0.9);assert.equal(s.appearance.frame.opacity,0.6);
  assert.equal(f.source.fieldPaths[0].path,'nodeGenerationData.overrides[1].fillPaints[0]');
  assert.equal(p.geometry[0].commandsBlob,0);assert.equal(p.geometry[0].blob.sha256,createHash('sha256').update(curve).digest('hex'));
  assert.equal(p.geometry[0].source.fieldPaths[0].path,'derivedImmutableFrameData.overrides[0].fillGeometry[0]');
  assert.equal(p.geometry[0].path,'M0 0C10 0 15 20 30 40L0 40Z');
  assert.equal(p.id,undefined);assert.equal(f.id,undefined);
  const rendered=page(s);assert.equal(rendered.node.presentationKind,'shape');assert.equal(rendered.node.sourceNodeType,'SHAPE_WITH_TEXT');
  assert.match(rendered.source,/<div class="figma-shape figma-generated-shape"[^>]*><svg /);assert.match(rendered.source,/fill-opacity="0.8" opacity="0.47"/);
  assert.match(rendered.source,/<g[^>]*opacity="0.9"/);assert.match(rendered.source,/opacity:0.6;/);
  assert.doesNotMatch(rendered.source,/DeckGroup|StudioText|StudioRun/);assert.equal(rendered.node.runs,undefined);
});

test('linear gradient retains all stops including terminal opacity and the full nontrivial affine projection',()=>{
  const transform={m00:0.75,m01:0.2,m02:0.08,m10:-0.2,m11:0.24,m12:0.47};
  const stops=[{position:0,color:{r:0,g:0,b:0,a:1}},{position:0.31,color:{r:0,g:0,b:0,a:0}},{position:0.72,color:{r:0,g:0,b:0,a:0}},{position:0.875,color:{r:0,g:0,b:0,a:1}}];
  const paint={type:'GRADIENT_LINEAR',opacity:0.7,visible:true,transform,stops,stopsVar:{variableEvidence:'retained'},styleIdForFill:{guid:guid(99)}};
  const s=converted(paint),f=s.appearance.parts[0].fills[0];assert.equal(s.warnings.length,0);
  assert.deepEqual(f.transform,transform);assert.deepEqual(f.stops.map(x=>({position:x.position,color:x.color})),stops);assert.deepEqual(f.raw,paint);
  const r=f.rendererProjection;assert.equal(r.scope,'INTERPRETED-OBSERVED');assert.equal(r.units,'userSpaceOnUse');
  const [a,b,c,d,e,g]=r.matrix;
  // Independent scalar-field checks: canonical SVG gradient coordinates map
  // back to source paint coordinates under the retained full matrix.
  for(const [x,y] of [[0,0.5],[0.2,0.9],[1,0.5]]){
    const px=(a*x+c*y+e)/30,py=(b*x+d*y+g)/40;
    assert.ok(Math.abs(transform.m00*px+transform.m01*py+transform.m02-x)<1e-12);
    assert.ok(Math.abs(transform.m10*px+transform.m11*py+transform.m12-y)<1e-12);
  }
  const rendered=page(s).source;
  assert.match(rendered,/gradientUnits="userSpaceOnUse"/);assert.match(rendered,/gradientTransform="matrix\(/);
  assert.equal((rendered.match(/<stop /g)??[]).length,4);assert.match(rendered,/offset="0.875"[^>]*stop-opacity="1"/);
  assert.match(rendered,/opacity="0.7"/);assert.doesNotMatch(rendered,/linear-gradient\(|angle=/);
});

test('source record ordering and GUID suffixes do not define generated shape identity',()=>{
  const s=sample();s.node.nodeGenerationData.overrides.reverse();s.node.derivedImmutableFrameData.overrides.reverse();
  const appearance=generatedAppearance(s.doc,s.node,s.warnings);
  assert.equal(s.warnings.length,0);assert.deepEqual(appearance.parts[0].fills[0].color,color);
  assert.equal(appearance.parts[0].source.records[0].path,'nodeGenerationData.overrides[0]');
  assert.equal(appearance.parts[0].source.records[1].path,'derivedImmutableFrameData.overrides[1]');
});

test('ambiguous cross-domain evidence and duplicate addresses are preserved with explicit unsupported status',()=>{
  for(const mutate of [s=>{s.node.derivedImmutableFrameData.overrides[0].fillPaints=[{type:'SOLID',color:{r:1,g:0,b:0,a:1}}];},s=>{s.node.nodeGenerationData.overrides.push({...s.node.nodeGenerationData.overrides[1]});}]){
    const s=sample();mutate(s);const appearance=generatedAppearance(s.doc,s.node,s.warnings);
    assert.equal(appearance.parts[0].rendering.supported,false);assert.ok(s.warnings.some(w=>w.code==='ambiguous-override-source'));
    assert.deepEqual(appearance.sourceDomains.nodeGenerationData,s.node.nodeGenerationData);
  }
});

test('unknown/truncated/nonfinite geometry never becomes a partial path or invented rectangle',()=>{
  for(const bytes of [Uint8Array.from([...curve,99]),curve.slice(0,8),commands([[1,NaN,0]])]){
    const g=decodeAppearanceGeometry({message:{blobs:[{bytes}]}},{commandsBlob:0,windingRule:'NONZERO'},{});
    assert.equal(g.path,null);assert.equal(g.decode.supported,false);assert.ok(g.decode.reason);assert.ok(g.blob.sha256);
  }
  const s=sample();s.node.derivedImmutableFrameData.overrides[0].fillGeometry=[];
  const appearance=generatedAppearance(s.doc,s.node,s.warnings);assert.equal(appearance.parts.length,0);assert.ok(s.warnings.some(w=>w.code==='unknown-generated-geometry'));
});

test('unsupported gradient form and singular matrix retain raw source and precise fallback reasons',()=>{
  for(const p of [{type:'GRADIENT_RADIAL',stops:[],transform:I},{type:'GRADIENT_LINEAR',stops:[],transform:{...I,m00:0,m11:0}}]){
    const s=converted(p);assert.equal(s.appearance.parts[0].rendering.supported,false);assert.ok(s.warnings.length);assert.deepEqual(s.appearance.parts[0].fills[0].raw,p);
    assert.doesNotMatch(page(s).source,/<linearGradient/);
  }
  assert.equal(linearGradientProjection(null,{x:10,y:10}).supported,false);
});

test('uniform video/image radii clip the owning media container; zero and missing radius are distinct',()=>{
  for(const kind of ['video','image'])for(const radius of [8,0,undefined]){
    const raw={guid:guid(2),type:'ROUNDED_RECTANGLE',...(radius===undefined?{}:{cornerRadius:radius})};
    const media={kind,member:'resource',mode:'FILL',paintTransform:I,opacity:1};
    const node={id:'17:2',type:raw.type,presentationKind:kind,name:'public media',size:{x:100,y:90},transform:I,visible:true,opacity:1,media,mediaCorners:mediaCorners(raw),children:[]};
    const source=renderPage({id:'17:1',background:'#000',children:[node],notes:{status:'empty'}},new Map([['resource',{url:'/media/public.mp4'}]]),[]);
    assert.match(source,kind==='video'?/<DeckVideo/:/<DeckImage/);
    if(radius===undefined)assert.doesNotMatch(source,/border-radius:/);else assert.match(source,new RegExp(`border-radius:${radius}px;overflow:hidden;`));
  }
  const independent=mediaCorners({guid:guid(2),type:'ROUNDED_RECTANGLE',cornerRadius:8,rectangleCornerRadiiIndependent:true,rectangleTopLeftCornerRadius:3});
  assert.equal(independent.uniformRadius,null);assert.equal(independent.fields.rectangleTopLeftCornerRadius,3);
});

test('scene retains raw media mode/matrix/intrinsics separately from existing private renderer projection',()=>{
  const paint={type:'VIDEO',video:{hash:new Uint8Array(20)},imageScaleMode:'STRETCH',transform:{...I,m00:0.5,m11:0.8,m02:0.1,m12:0.2},originalImageWidth:200,originalImageHeight:100};
  const slide={guid:guid(1),type:'SLIDE',size:{x:100,y:90}},video={guid:guid(2),type:'ROUNDED_RECTANGLE',parentIndex:{guid:slide.guid,position:'a'},size:{x:100,y:90},cornerRadius:8,fillPaints:[paint]};
  const model=buildScenes({header:{prelude:'fig-deck',version:106},nodes:[slide,video]},[{name:`videos/${'0'.repeat(40)}`}]);
  const n=model.scenes[0].children[0];assert.equal(n.media.mode,'STRETCH');assert.equal(n.media.source.rawMode,'STRETCH');
  assert.deepEqual(n.media.source.rawTransform,paint.transform);assert.deepEqual(n.media.original,{width:200,height:100});
  assert.equal(n.media.rendererProjection.rule,'existing-axis-aligned-inverse-STRETCH');assert.equal(n.media.rendererProjection.style.width,'200%');
  assert.equal(n.mediaCorners.uniformRadius,8);assert.equal(mediaProjection({...n.media,paintTransform:{...paint.transform,m01:0.1}}).supported,false);
});
