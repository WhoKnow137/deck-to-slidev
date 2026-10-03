// Converter evidence for observed source cases, not an editing contract.
import {createHash} from 'node:crypto';
import {nodeId,getBlobBytes,geometryBlobToSVGPath} from 'openfig-core';

const SOURCE='SOURCE-BACKED', INTERPRETED='INTERPRETED-OBSERVED';
const I={m00:1,m01:0,m02:0,m10:0,m11:1,m12:0};
const matrixKeys=Object.keys(I);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const finiteMatrix=t=>t&&matrixKeys.every(k=>Number.isFinite(t[k]));
const pathKey=p=>p?.guids?.length?JSON.stringify(p.guids):null;
const rgba=c=>c&&['r','g','b','a'].every(k=>Number.isFinite(c[k]))?{r:c.r,g:c.g,b:c.b,a:c.a}:null;

export function linearGradientProjection(transform,size){
  if(!finiteMatrix(transform))return {scope:INTERPRETED,supported:false,reason:'missing-or-invalid-gradient-matrix'};
  const {m00:a,m01:c,m02:e,m10:b,m11:d,m12:f}=transform,det=a*d-b*c;
  if(Math.abs(det)<1e-12)return {scope:INTERPRETED,supported:false,reason:'noninvertible-gradient-matrix'};
  if(!(size?.x>0&&size?.y>0))return {scope:INTERPRETED,supported:false,reason:'invalid-gradient-frame'};
  // SVG's full basis transform preserves the scalar field under shear as well
  // as rotation. Endpoints alone would lose that information.
  return {scope:INTERPRETED,supported:true,renderer:'svg-linear-gradient',units:'userSpaceOnUse',
    x1:0,y1:0.5,x2:1,y2:0.5,
    matrix:[size.x*d/det,-size.y*b/det,-size.x*c/det,size.y*a/det,size.x*(c*f-d*e)/det,size.y*(b*e-a*f)/det]};
}

export function decodeAppearanceGeometry(doc,g,source){
  const bytes=getBlobBytes(doc,g.commandsBlob);
  const out={scope:SOURCE,source,raw:g,commandsBlob:g.commandsBlob??null,
    blob:bytes?{index:g.commandsBlob,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}:null,
    windingRule:g.windingRule??null,path:null,decode:{scope:INTERPRETED,supported:false,reason:null}};
  try{
    if(!bytes?.length)throw Error('missing-or-empty-commands-blob');
    // openfig-core returns a partial path for an unknown/truncated command.
    // Validate the complete stream before using its existing path decoder.
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=0,moved=false;
    while(offset<bytes.length){
      const at=offset,cmd=bytes[offset++],count=({0:0,1:2,2:2,4:6})[cmd];
      if(count===undefined)throw Error(`unknown-command-${cmd}-at-${at}`);
      if(!moved&&cmd!==1)throw Error(`missing-move-command-at-${at}`);
      if(offset+count*4>bytes.length)throw Error(`truncated-command-at-${at}`);
      for(let k=0;k<count;k++)if(!Number.isFinite(view.getFloat32(offset+k*4,true)))throw Error(`nonfinite-coordinate-at-${offset+k*4}`);
      moved=true;offset+=count*4;
    }
    if(!['NONZERO','ODD'].includes(g.windingRule))throw Error('unknown-winding-rule');
    out.path=geometryBlobToSVGPath(bytes);
    if(!out.path)throw Error('empty-decoded-path');
    out.decode={scope:INTERPRETED,supported:true,decoder:'openfig-core@0.4.1/geometryBlobToSVGPath',coordinateRoundingDecimals:2};
  }catch(e){out.decode.reason=e.message;}
  return out;
}

export function generatedAppearance(doc,n,warnings){
  const id=nodeId(n),appearance={scope:SOURCE,sourceNodeId:id,sourceNodeType:n.type,
    frame:{size:n.size??null,transform:n.transform??null,opacity:n.opacity??null},
    sourceDomains:{nodeGenerationData:n.nodeGenerationData??null,derivedImmutableFrameData:n.derivedImmutableFrameData??null},
    interpretation:{scope:INTERPRETED,rule:'unambiguous-complete-guidPath-join-with-source-fillGeometry',editingIdentity:'deferred'},parts:[]};
  const domains=['nodeGenerationData','derivedImmutableFrameData'];
  const records=domains.flatMap(domain=>(n[domain]?.overrides??[]).map((raw,index)=>({domain,path:`${domain}.overrides[${index}]`,raw,key:pathKey(raw.guidPath)})));
  const warn=(code,source,reason)=>warnings.push({code,nodeId:id,scope:INTERPRETED,source,reason});
  const used=new Set();
  for(const geometryRecord of records.filter(r=>r.raw.fillGeometry?.length)){
    if(used.has(geometryRecord))continue;
    const matched=geometryRecord.key?records.filter(r=>r.key===geometryRecord.key):[geometryRecord];
    const source={scope:SOURCE,parentSourceGuid:n.guid,sourceNodeId:id,sourceNodeType:n.type,guidPath:geometryRecord.raw.guidPath??null,
      records:matched.map(r=>({domain:r.domain,path:r.path}))};
    const part={scope:SOURCE,source,size:null,transform:null,opacity:null,fills:[],geometry:[],corners:null,
      rendering:{scope:INTERPRETED,supported:true,reasons:[]}};
    const reject=reason=>{part.rendering.supported=false;part.rendering.reasons.push(reason);warn(reason.startsWith('ambiguous')?'ambiguous-override-source':'unsupported-generated-shape',source,reason);};
    // A source path is an address for this parse, never a permanent subpart ID.
    if(domains.some(d=>matched.filter(r=>r.domain===d).length>1))reject('ambiguous-duplicate-guidPath');
    matched.forEach(r=>used.add(r));
    const field=(name,required=false)=>{
      const supplied=matched.filter(r=>r.raw[name]!==undefined);
      if(supplied.length>1&&!supplied.every(r=>equal(r.raw[name],supplied[0].raw[name]))){reject(`ambiguous-${name}`);return null;}
      if(!supplied.length){if(required)reject(`missing-${name}`);return null;}
      return {value:supplied[0].raw[name],sources:supplied.map(r=>({scope:SOURCE,domain:r.domain,path:`${r.path}.${name}`}))};
    };
    const size=field('size',true),transform=field('transform',true),opacity=field('opacity'),paints=field('fillPaints',true),geometry=field('fillGeometry',true);
    part.size=size?.value??null;part.transform=transform?.value??null;part.opacity=opacity?.value??null;
    part.fieldSources={size:size?.sources??[],transform:transform?.sources??[],opacity:opacity?.sources??[],fillPaints:paints?.sources??[],fillGeometry:geometry?.sources??[]};
    part.corners=matched.flatMap(r=>Object.entries(r.raw).filter(([k])=>/corner/i.test(k)).map(([field,value])=>({scope:SOURCE,field,value,domain:r.domain,path:`${r.path}.${field}`})));
    if(!finiteMatrix(part.transform)||!Number.isFinite(part.size?.x)||!Number.isFinite(part.size?.y))reject('invalid-generated-frame');
    part.geometry=(geometry?.value??[]).map((g,i)=>decodeAppearanceGeometry(doc,g,{...source,fieldPaths:geometry.sources.map(s=>({...s,path:`${s.path}[${i}]`}))}));
    for(const g of part.geometry)if(!g.decode.supported)reject(`unknown-generated-geometry:${g.decode.reason}`);
    if(part.geometry.length!==1)reject('unknown-generated-geometry:unverified-multiple-path-composition');
    if(part.geometry.some(g=>g.raw.styleID!=null&&g.raw.styleID!==0))reject('unknown-generated-geometry:unverified-styleID');
    for(const [i,p] of (paints?.value??[]).entries()){
      const fill={scope:SOURCE,type:p.type,color:rgba(p.color),opacity:p.opacity??null,visible:p.visible??null,
        stops:p.stops?.map(s=>({position:s.position,color:rgba(s.color),raw:s}))??null,transform:p.transform??null,raw:p,
        source:{...source,fieldPaths:paints.sources.map(s=>({...s,path:`${s.path}[${i}]`}))},
        rendering:{scope:INTERPRETED,supported:true}};
      if(p.visible!==false){
        let reason=null;
        if(p.type==='SOLID'){if(!fill.color)reason='invalid-solid-color';}
        else if(p.type==='GRADIENT_LINEAR'){
          fill.rendererProjection=linearGradientProjection(p.transform,part.size);
          if(!fill.rendererProjection.supported)reason=fill.rendererProjection.reason;
          else if(!fill.stops?.length||fill.stops.some(s=>!Number.isFinite(s.position)||!s.color))reason='invalid-gradient-stops';
        }else reason=`unsupported-gradient-or-paint-form:${p.type}`;
        if(p.blendMode&&p.blendMode!=='NORMAL')reason=`unsupported-generated-paint-blend:${p.blendMode}`;
        if(reason){fill.rendering={scope:INTERPRETED,supported:false,reason};reject(reason);}
      }
      part.fills.push(fill);
    }
    for(const r of matched){
      if(r.raw.strokePaints?.some(p=>p.visible!==false)||r.raw.effects?.some(e=>e.visible!==false))reject('unsupported-generated-stroke-or-effect');
    }
    appearance.parts.push(part);
  }
  if(!appearance.parts.length)warn('unknown-generated-geometry',null,'no-source-fillGeometry; no rectangle invented');
  return appearance;
}

export function mediaCorners(n){
  const fields=Object.fromEntries(Object.entries(n).filter(([k])=>/corner/i.test(k)));
  const supported=Number.isFinite(n.cornerRadius)&&n.cornerRadius>=0&&n.rectangleCornerRadiiIndependent!==true;
  return {scope:SOURCE,sourceNodeId:nodeId(n),sourceNodeType:n.type,fields,
    uniformRadius:supported?n.cornerRadius:null,
    sourcePaths:Object.keys(fields).map(path=>({scope:SOURCE,path})),
    rendering:{scope:INTERPRETED,supported,reason:supported?null:typeof n.cornerRadius==='undefined'?'no-source-uniform-radius':'unverified-corner-form'}};
}

// Keep the private source mode/matrix distinct from the pre-existing renderer
// projection. STRETCH is not renamed to Crop and no crop mutation is provided.
export function mediaProjection(m){
  const t=m.paintTransform;
  const num=n=>Number(n.toFixed(6));
  if(m.mode==='STRETCH'&&finiteMatrix(t)&&t.m00&&t.m11&&!t.m01&&!t.m10)return {scope:INTERPRETED,supported:true,rule:'existing-axis-aligned-inverse-STRETCH',
    style:{position:'absolute',width:`${num(100/t.m00)}%`,height:`${num(100/t.m11)}%`,left:`${num(-100*t.m02/t.m00)}%`,top:`${num(-100*t.m12/t.m11)}%`,objectFit:'fill'}};
  return {scope:INTERPRETED,supported:['FILL','FIT'].includes(m.mode),rule:m.mode==='FILL'?'existing-cover':m.mode==='FIT'?'existing-contain':'existing-fallback-fill',
    style:{position:'absolute',width:'100%',height:'100%',left:'0',top:'0',objectFit:m.mode==='FILL'?'cover':m.mode==='FIT'?'contain':'fill'}};
}

export function appearanceSummary(scenes){
  const result={scope:INTERPRETED,records:[]};
  const walk=(n,s)=>{
    if(n.appearance)result.records.push({slideId:s.id,skipped:s.skipped,nodeId:n.id,status:n.appearance.parts.some(p=>p.rendering.supported&&p.fills.some(f=>f.visible!==false))?'rendered-generated-shape':'unsupported-generated-shape',
      paints:n.appearance.parts.filter(p=>p.rendering.supported).flatMap(p=>p.fills.filter(f=>f.visible!==false).map(f=>f.type==='GRADIENT_LINEAR'?'rendered-gradient':'rendered-solid-overlay')),
      reasons:n.appearance.parts.flatMap(p=>p.rendering.reasons)});
    if(n.media&&n.mediaCorners?.uniformRadius>0)result.records.push({slideId:s.id,skipped:s.skipped,nodeId:n.id,status:'rendered-corner-radius',radius:n.mediaCorners.uniformRadius});
    n.children.forEach(c=>walk(c,s));
  };
  for(const s of scenes)s.children.forEach(n=>walk(n,s));
  result.counts={};for(const r of result.records)for(const status of [r.status,...r.paints??[]])result.counts[status]=(result.counts[status]??0)+1;
  return result;
}
