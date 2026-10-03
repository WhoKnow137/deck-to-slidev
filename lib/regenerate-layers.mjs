import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {managedLayerSpans,parseManagedLayer} from './layer-contract.mjs';
import {layerProvenanceForPage,analyzeLayer} from './managed-layer.mjs';
import {subtreeFingerprint} from './studio-text.mjs';
import {renderPage} from './render-semantic.mjs';
const json=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
export function regenerateLayers({out,scenes,assets}){
  const file=path.join(out,'data/layer-provenance.json'),report={schemaVersion:1,ownership:'layer-geometry-only',objects:[],counts:{}};
  // Older accepted outputs remain renderable; promotion is explicit via fresh conversion.
  if(!fs.existsSync(file)){report.reason='layer-provenance-absent; fresh conversion required';json(path.join(out,'layer-regeneration-report.json'),report);return report;}
  const previous=JSON.parse(fs.readFileSync(file)),index=JSON.parse(fs.readFileSync(path.join(out,'data/slides/index.json')));
  const structuralFile=path.join(out,'data/structural-provenance.json');
  const structural=fs.existsSync(structuralFile)?JSON.parse(fs.readFileSync(structuralFile)):{schemaVersion:1,objects:{}};
  if(structural.schemaVersion!==1)throw Error('Unsupported structural provenance');
  if(previous.schemaVersion!==1)throw Error('Unsupported layer provenance');
  const records=new Map();for(const r of previous.objects){if(records.has(r.objectId))throw Error('Ambiguous layer provenance');records.set(r.objectId,r);}
  const seen=new Set();
  const status=(r,state,reason)=>{report.objects.push({objectId:r.objectId,slideId:r.slideId,status:state,...(reason?{reason}:{})});report.counts[state]=(report.counts[state]??0)+1;};
  for(const scene of scenes){
    const row=index.find(r=>r.id===scene.id);if(!row)continue;
    if(!/^pages\/(?:skipped\/)?\d{3}\.md$/.test(row.page))throw Error('Unsafe layer source path');
    const pageFile=path.join(out,row.page),current=fs.readFileSync(pageFile,'utf8'),candidate=renderPage(scene,assets,[]);
    let local,proposed,generated;
    try{
      local=new Map();for(const s of managedLayerSpans(current)){if(local.has(s.id))throw Error('duplicate-local-layer-id');local.set(s.id,s);}
      proposed=new Map(managedLayerSpans(candidate).map(s=>[s.id,s]));generated=layerProvenanceForPage(scene,candidate,row.page);
    }catch(e){for(const r of previous.objects.filter(r=>r.slideId===scene.id))status(r,'error',String(e));continue;}
    const patches=[];
    for(const next of generated){
      seen.add(next.objectId);const base=records.get(next.objectId),span=local.get(next.objectId);
      const localStructure=structural.objects?.[next.objectId];
      if(localStructure?.origin==='imported'&&localStructure.state!=='active'){
        status(next,base&&base.sourceFingerprint!==next.sourceFingerprint?'source-and-local-structural-conflict':'local-structural-preserved',localStructure.state);
        continue;
      }
      if(!base){status(next,'migration-required','No geometry ownership baseline; no insertion');continue;}
      if(base.sourceFile!==row.page||base.slideId!==scene.id||base.figmaNodeId!==next.figmaNodeId){status(base,'error','provenance-target-mismatch');continue;}
      if(!span){status(base,'locally-deleted');continue;}
      if(subtreeFingerprint(span.source)!==base.lastGeneratedFingerprint){
        const state=base.sourceFingerprint===next.sourceFingerprint?'locally-modified-preserved':'source-and-local-conflict';status(base,state);
        if(state==='source-and-local-conflict'){
          const dir=path.join(out,'data/layer-conflicts');fs.mkdirSync(dir,{recursive:true});
          json(path.join(dir,`${base.objectId}.json`),{base,local:span.source,proposed:proposed.get(next.objectId).source,newSourceFingerprint:next.sourceFingerprint});
        }continue;
      }
      const replacement=proposed.get(next.objectId).source;
      if(replacement===span.source&&base.sourceFingerprint===next.sourceFingerprint){status(base,'unchanged');continue;}
      patches.push({...span,replacement,next});status(next,'regenerated');
    }
    if(patches.length){
      let updated=current;for(const p of patches.sort((a,b)=>b.start-a.start))updated=updated.slice(0,p.start)+p.replacement+updated.slice(p.end);
      for(const p of managedLayerSpans(updated))parseManagedLayer(p.source);
      if(fs.readFileSync(pageFile,'utf8')!==current)throw Error('stale-layer-regeneration');
      const temp=pageFile+'.oe0a-'+randomUUID()+'.tmp';try{const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,updated);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(fs.readFileSync(pageFile,'utf8')!==current)throw Error('stale-layer-regeneration');fs.renameSync(temp,pageFile);}finally{if(fs.existsSync(temp))fs.rmSync(temp);}
      for(const p of patches)records.set(p.id,p.next);
    }
  }
  for(const r of previous.objects)if(!seen.has(r.objectId)&&!report.objects.some(o=>o.objectId===r.objectId)){
    const state=structural.objects?.[r.objectId]?.state,scene=scenes.find(s=>s.id===r.slideId);
    let candidate=null;
    if(scene){const search=list=>{for(const n of list){if(n.id===r.figmaNodeId)return n;const child=search(n.children??[]);if(child)return child}return null};
      const node=search(scene.children);if(node)candidate=analyzeLayer(node,scene.id)?.sourceFingerprint??null;}
    status(r,state&&state!=='active'?(candidate===null?'source-removed-local-structural-conflict':candidate===r.sourceFingerprint?'local-structural-preserved':'source-and-local-structural-conflict'):'source-removed');
  }
  json(file,{schemaVersion:1,objects:[...records.values()].sort((a,b)=>a.sourceFile.localeCompare(b.sourceFile)||a.objectId.localeCompare(b.objectId))});
  let structuralChanged=false;
  for(const item of report.objects.filter(x=>x.status==='source-removed'||x.status==='source-removed-local-structural-conflict')){
    const base=records.get(item.objectId);if(!base)continue;
    const old=structural.objects[item.objectId];
    if(!old){structural.objects[item.objectId]={origin:'imported',state:'source-removed',sourceSlideId:base.slideId,
      currentSlideId:base.slideId,sourceFile:base.sourceFile,sourceFingerprint:base.sourceFingerprint,sourceRemoved:true};structuralChanged=true;}
    else if(!old.sourceRemoved){old.sourceRemoved=true;structuralChanged=true;}
  }
  if(structuralChanged){structural.nextId??=1;structural.slides??={};json(structuralFile,structural);}
  report.objects.sort((a,b)=>a.objectId.localeCompare(b.objectId));json(path.join(out,'layer-regeneration-report.json'),report);return report;
}
