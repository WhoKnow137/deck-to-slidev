import {studioId,canonicalJson,subtreeFingerprint} from './studio-text.mjs';
import {managedLayerSpans,parseManagedLayer} from './layer-contract.mjs';
export const layerId=(slideId,nodeId)=>`layer-${studioId(slideId)}--${studioId(nodeId)}`;
const round=n=>Number(n.toFixed(6));
export function analyzeLayer(n,slideId,{nested=false,duplicate=false,parentId}={}){
  if(n.runs||n.presentationKind==='text')return null;
  let kind=['image','gif','video','shape','vector'].includes(n.presentationKind)?n.presentationKind
    :n.type==='INSTANCE'?'instance':['FRAME','GROUP'].includes(n.type)?'frame':null;
  if(!kind)return null;
  const m=n.transform,w=n.size?.x,h=n.size?.y;
  if(!n.id||duplicate||!m||!(w>0&&h>0)||[w,h,...['m00','m01','m02','m10','m11','m12'].map(k=>m[k])].some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))return {managed:false,reason:duplicate?'duplicate-source-identity':'missing-safe-layer-geometry',kind};
  const a=m.m00,b=m.m10,c=m.m01,d=m.m11;
  const unit=Math.abs(Math.hypot(a,b)-1)<1e-4&&Math.abs(Math.hypot(c,d)-1)<1e-4&&Math.abs(a*c+b*d)<1e-4&&Math.abs(a*d-b*c-1)<1e-4;
  const rotation=unit?round(((Math.atan2(b,a)*180/Math.PI+180)%360+360)%360-180):0;
  const geometry={x:round(unit?m.m02+(a*w+c*h-w)/2:m.m02),y:round(unit?m.m12+(b*w+d*h-h)/2:m.m12),width:round(w),height:round(h),rotationDeg:rotation};
  if(geometry.width<=0||geometry.height<=0)return {managed:false,reason:'dimensions-below-geometry-precision',kind};
  const level=nested||!unit?'READ_ONLY':['image','gif','video'].includes(kind)&&!n.children?.length?'FULL':'POSITION_ONLY';
  const reason=nested?'Nested parent-local layer: mutation deferred':!unit?'Affine/sheared/reflected source transform preserved; decomposition unavailable':level==='POSITION_ONLY'?'Resize disabled: preserve path topology, generated paint and child constraints':'Layer frame only; paint/crop source is immutable to geometry edits';
  return {managed:true,version:1,id:layerId(slideId,n.id),slideId,source:{figmaGuid:n.id,kiwiType:n.type,instancePath:n.id.split('/').slice(0,-1)},
    ...(parentId?{parentId}:{}),kind,geometry,capabilities:{level,reason,rotation:unit&&!nested},affine:!unit,
    sourceFingerprint:subtreeFingerprint(canonicalJson(n))};
}
export function layerContext(scene){
  const counts=new Map();const walk=n=>{counts.set(n.id,(counts.get(n.id)??0)+1);n.children?.forEach(walk)};scene.children.forEach(walk);
  return {slideId:scene.id,counts};
}
export function layerProvenanceForPage(scene,page,sourceFile){
  const context=layerContext(scene),byId=new Map();
  for(const span of managedLayerSpans(page)){if(byId.has(span.id))throw Error(`duplicate-layer-id:${span.id}`);byId.set(span.id,span);}
  return scene.children.map(n=>{const a=analyzeLayer(n,scene.id,{duplicate:context.counts.get(n.id)!==1});if(!a?.managed)return null;
    const span=byId.get(a.id);if(!span)throw Error(`Managed layer missing:${a.id}`);parseManagedLayer(span.source);
    return {objectId:a.id,figmaNodeId:n.id,slideId:scene.id,sourceFile,objectType:'StudioLayer',contractVersion:1,
      sourceFingerprint:a.sourceFingerprint,lastGeneratedFingerprint:subtreeFingerprint(span.source),geometryOwnership:'layer-only',kind:a.kind,capabilities:a.capabilities,
      ...(parseManagedLayer(span.source).paintInspection?{paintOwnership:'inspection-only',paintEvidenceFingerprint:subtreeFingerprint(canonicalJson(parseManagedLayer(span.source).paintInspection.evidence))}:{})};
  }).filter(Boolean);
}
