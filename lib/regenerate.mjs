import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseStudioText,studioTextSpans} from './studio-contract.mjs';
import {analyzeStudioText,studioId,subtreeFingerprint,textFingerprint} from './studio-text.mjs';
import {renderPage,renderUnsupportedText} from './render-semantic.mjs';
import {renderPage as renderLegacyPage} from './render-semantic-legacy.mjs';

export const PROVENANCE_SCHEMA=1;
const INSERT='<!-- figma-managed-insert -->';
const REPORT_STATES=['generated','unchanged','regenerated','locally-modified-preserved','source-and-local-conflict',
  'unsupported','missing-font','read-only-transform','migration-required','deleted-local','source-removed','error'];
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const template=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../template');
const nodes=scene=>{
  const result=[];
  const walk=node=>{if(node.runs)result.push(node);for(const child of node.children??[])walk(child);};
  for(const child of scene.children)walk(child);
  return result;
};
const nestedTextIds=scene=>{
  const result=new Set();
  const walk=(node,depth)=>{if(node.runs&&(depth>0||node.children?.length))result.add(node.id);for(const child of node.children??[])walk(child,depth+1);};
  for(const child of scene.children)walk(child,0);
  return result;
};
function spans(source){
  const list=studioTextSpans(source),byId=new Map();
  for(const span of list){
    if(byId.has(span.id))throw Error(`duplicate-id:${span.id}`);
    const parsed=parseStudioText(span.source);
    if(!parsed.ok)throw Error(`unsupported-StudioText:${span.id}:${parsed.reason}`);
    byId.set(span.id,span);
  }
  return byId;
}
function record(node,scene,sourceFile,capability,source){
  return {figmaNodeId:node.id,studioId:studioId(node.id),slideId:scene.id,
    sourceFingerprint:capability.sourceFingerprint,lastGeneratedFingerprint:subtreeFingerprint(source),
    sourceFile,objectType:'StudioText',converterVersion:'0.6.1'};
}
export function provenanceForPage(scene,page,sourceFile){
  const byId=spans(page),objects=[],nested=nestedTextIds(scene);
  for(const node of nodes(scene)){
    const capability=analyzeStudioText(node,{nested:nested.has(node.id)});
    if(!capability.supported)continue;
    const span=byId.get(studioId(node.id));
    if(!span)throw Error(`Generated StudioText missing: ${node.id}`);
    objects.push(record(node,scene,sourceFile,capability,span.source));
  }
  return objects;
}
export function validateManagedPage(source){return spans(source);}
function atomicPageWrite(file,expected,next){
  if(next===expected)return false;
  const temp=path.join(path.dirname(file),`.figma-text-${randomUUID()}.tmp`);
  try{
    const fd=fs.openSync(temp,'wx');
    try{fs.writeFileSync(fd,next,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(fs.readFileSync(file,'utf8')!==expected)throw Error('stale-page-revision');
    fs.renameSync(temp,file);
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
  return true;
}
function safePage(out,relative){
  if(!/^pages\/(?:skipped\/)?\d{3}\.md$/.test(relative))throw Error(`Unsafe page path: ${relative}`);
  return path.join(out,...relative.split('/'));
}
function status(report,entry){report.objects.push(entry);report.counts[entry.status]=(report.counts[entry.status]??0)+1;}
function diagnostic(report,entry){report.diagnostics.push(entry);report.counts[entry.code]=(report.counts[entry.code]??0)+1;}
function conflictFile(out,slideId,id){
  const safe=s=>s.replace(/[^a-zA-Z0-9_-]/g,'-');
  return path.join(out,'data','conversion-conflicts',`${safe(slideId)}__${safe(id)}.json`);
}
function candidateFor(scene,assets){
  const warnings=[];
  const page=renderPage(scene,assets,warnings);
  return {page,byId:spans(page),warnings};
}
function migrateLegacyProject({out,scenes,assets,inputSha,index,report}){
  const oldReport=read(path.join(out,'conversion-report.json'));
  const packageFile=path.join(out,'package.json'),pkg=read(packageFile);
  const expectedScripts={setup:'node install-slidev.mjs',predev:'node patch-studio.mjs',dev:'slidev',prebuild:'node patch-studio.mjs',build:'slidev build',verify:'node verify.mjs'};
  const expectedDependencies={'@fontsource/inter':'^5.3.0','@fontsource/inter-tight':'^5.3.0',
    '@fontsource/nanum-myeongjo':'^5.3.0','@slidev/cli':'^53.0.0','@slidev/theme-default':'^0.25.0',
    'slidev-addon-studio':'0.3.1'};
  const sameObject=(left,right)=>JSON.stringify(Object.fromEntries(Object.entries(left??{}).sort()))===JSON.stringify(Object.fromEntries(Object.entries(right).sort()));
  const validPackage=pkg.name==='converted-deck-slidev'&&pkg.devDependencies?.['slidev-addon-studio']==='0.3.1'
    &&pkg.private===true&&pkg.type==='module'&&sameObject(pkg.scripts,expectedScripts)
    &&sameObject(pkg.devDependencies,expectedDependencies)&&JSON.stringify(pkg.slidev?.addons)==='["slidev-addon-studio"]';
  const expectedLegacyFiles={'install-slidev.mjs':'6e3e3ed72847ae7145c203e3a4ca53550779feac892984326da459fbb8ee5467',
    'verify.mjs':'ec3505379a2c248e21f8f350272bb1a8925b6e97d17b3f377e9cb5c5093e1d65',
    'package-lock.json':'3e47c704b9457118572146cd6500f763156c0b48db2ecac305a3977f58adbed5'};
  const customizedFile=Object.entries(expectedLegacyFiles).find(([name,hash])=>{
    const file=path.join(out,name);return fs.existsSync(file)&&subtreeFingerprint(fs.readFileSync(file,'utf8'))!==hash;
  })?.[0];
  const reason=oldReport.source?.sha256!==inputSha?'source-deck-changed'
    :oldReport.toolVersion!=='0.2.0'?'unknown-legacy-converter-version'
    :!validPackage?'legacy-package-customized'
    :customizedFile?`legacy-file-customized:${customizedFile}`:null;
  const failed=why=>{
    for(const scene of scenes)for(const node of nodes(scene))status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:studioId(node.id),status:'migration-required',reason:why});
    report.objects.sort((a,b)=>a.slideId.localeCompare(b.slideId)||a.studioId.localeCompare(b.studioId));
    json(path.join(out,'regeneration-report.json'),report);return report;
  };
  if(reason)return failed(reason);
  if(index.length!==scenes.length||index.some(row=>!scenes.some(scene=>scene.id===row.id)))return failed('slide-index-or-source-count-changed');
  const prepared=[];
  for(const row of index){
    const scene=scenes.find(item=>item.id===row.id),file=safePage(out,row.page);
    if(!fs.existsSync(file))return failed('legacy-page-missing');
    const current=fs.readFileSync(file,'utf8');
    const stored=read(path.join(out,row.data,'scene.json'));
    const notes=read(path.join(out,row.data,'notes.json'));
    const nav=current.match(/^figmaNavTarget: (\d+|null)$/m)?.[1];
    if(nav===undefined)return failed('legacy-page-frontmatter-unknown');
    const target=nav==='null'?null:Number(nav);
    const known=renderLegacyPage({...stored,notes},assets,[],target);
    if(current!==known)return failed(`legacy-page-differs-from-known-generated-source:${row.page}`);
    if(stored.id!==scene.id)return failed('stored-scene-identity-mismatch');
    const candidate=candidateFor(scene,assets);
    if(!candidate.page.endsWith('\n'))return failed('candidate-page-invalid');
    prepared.push({scene,file,current,candidate,sourceFile:row.page});
  }
  // All pages and the locked package are checked before the first write.
  const lock=read(path.join(template,'package-lock.json'));
  lock.name='converted-deck-slidev';lock.packages[''].name='converted-deck-slidev';
  const newPackage={name:'converted-deck-slidev',private:true,type:'module',
    scripts:{setup:'node install-slidev.mjs',dev:'slidev',build:'slidev build',verify:'node verify.mjs'},
    slidev:{addons:['slidev-addon-studio']},devDependencies:lock.packages[''].devDependencies};
  for(const item of prepared){
    atomicPageWrite(item.file,item.current,item.candidate.page);
    for(const row of provenanceForPage(item.scene,item.candidate.page,item.sourceFile))
      status(report,{slideId:item.scene.id,figmaNodeId:row.figmaNodeId,studioId:row.studioId,status:'regenerated'});
  }
  fs.mkdirSync(path.join(out,'components'),{recursive:true});
  for(const name of ['StudioText.vue','StudioRun.vue','StudioParagraph.vue','studio-decoration.ts','font-settings.ts','shared-text-styles.ts'])
    fs.copyFileSync(path.join(template,'components',name),path.join(out,'components',name));
  fs.mkdirSync(path.join(out,'vendor'),{recursive:true});
  const studioTarball=`slidev-addon-studio-${read(path.join(template,'studio-contract.json')).studioPackageVersion}.tgz`;
  fs.copyFileSync(path.join(template,'vendor',studioTarball),path.join(out,'vendor',studioTarball));
  for(const name of ['install-slidev.mjs','verify.mjs'])fs.copyFileSync(path.join(template,name),path.join(out,name));
  json(path.join(out,'data','converter-metadata.json'),read(path.join(template,'studio-contract.json')));
  json(path.join(out,'package-lock.json'),lock);json(packageFile,newPackage);
  const objects=prepared.flatMap(item=>provenanceForPage(item.scene,item.candidate.page,item.sourceFile))
    .sort((a,b)=>a.sourceFile.localeCompare(b.sourceFile)||a.studioId.localeCompare(b.studioId));
  json(path.join(out,'data','conversion-provenance.json'),{schemaVersion:PROVENANCE_SCHEMA,objects});
  report.objects.sort((a,b)=>a.slideId.localeCompare(b.slideId)||a.studioId.localeCompare(b.studioId));
  json(path.join(out,'regeneration-report.json'),report);return report;
}
function patchPage({out,scene,sourceFile,priorRecords,records,assets,report,structural}){
  const file=safePage(out,sourceFile),current=fs.readFileSync(file,'utf8');
  let existing,candidate;
  try{existing=spans(current);candidate=candidateFor(scene,assets);}
  catch(error){for(const node of nodes(scene))status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:studioId(node.id),status:'error',reason:String(error)});return;}
  const edits=[],insertions=[],nested=nestedTextIds(scene);
  const currentNodes=new Map(nodes(scene).map(node=>[studioId(node.id),node]));
  for(const node of nodes(scene)){
    const id=studioId(node.id),capability=analyzeStudioText(node,{nested:nested.has(node.id)}),base=priorRecords.get(id);
    const localStructure=structural.objects?.[id];
    if(localStructure?.origin==='imported'&&localStructure.state!=='active'){
      const changed=base&&textFingerprint(node)!==base.sourceFingerprint;
      status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,
        status:changed?'source-and-local-structural-conflict':'local-structural-preserved',
        reason:localStructure.state});
      continue;
    }
    if(capability.readOnlyTransform)diagnostic(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,code:'read-only-transform'});
    for(const family of new Set((node.runs??[]).map(run=>run.fontFamily).filter(Boolean)))
      if(!['Inter','Inter Tight','Nanum Myeongjo'].includes(family))diagnostic(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,code:'missing-font',family});
    if(!capability.supported){
      if(base){
        const local=existing.get(id);
        if(!local){status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'deleted-local'});continue;}
        const currentFingerprint=subtreeFingerprint(local.source),proposed=renderUnsupportedText(node);
        if(currentFingerprint===base.lastGeneratedFingerprint){
          edits.push({span:local,node,source:proposed,fallback:true});
          status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'unsupported',reason:capability.reason,action:'replaced-untouched-StudioText-with-fallback'});
        }else{
          const newFigmaFingerprint=textFingerprint(node);
          if(newFigmaFingerprint!==base.sourceFingerprint){
            const artifact={figmaNodeId:node.id,slideId:scene.id,studioId:id,reason:'source-and-local-conflict',
              existingLocalSubtree:local.source,lastGeneratedFingerprint:base.lastGeneratedFingerprint,
              currentLocalFingerprint:currentFingerprint,newFigmaFingerprint,proposedGeneratedSubtree:proposed};
            const output=conflictFile(out,scene.id,id);fs.mkdirSync(path.dirname(output),{recursive:true});json(output,artifact);
            status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'source-and-local-conflict',
              reason:`source-now-unsupported:${capability.reason}`,artifact:path.relative(out,output).replaceAll('\\','/')});
          }else status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'locally-modified-preserved',reason:`source-now-unsupported:${capability.reason}`});
        }
      }else if(current.includes(`data-figma-node-id="${node.id}"`)){
        status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'unsupported',reason:capability.reason});
      }else if(nested.has(node.id)||!current.includes(INSERT)){
        status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'migration-required',reason:`new-unsupported-text:${capability.reason}`});
      }else{
        insertions.push({node,source:renderUnsupportedText(node),fallback:true});
        status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'unsupported',reason:capability.reason,action:'inserted-new-fallback'});
      }
      continue;
    }
    const proposed=candidate.byId.get(id)?.source;
    if(!proposed){status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'error',reason:'candidate-missing'});continue;}
    const local=existing.get(id);
    if(!base){
      if(local||current.includes(`data-figma-node-id="${node.id}"`)){
        status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'migration-required',reason:'existing-object-without-provenance'});continue;
      }
      if(!current.includes(INSERT)){status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'migration-required',reason:'insertion-anchor-absent'});continue;}
      insertions.push({node,capability,source:proposed});
      status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'generated'});
      continue;
    }
    if(base.slideId!==scene.id||base.sourceFile!==sourceFile||base.figmaNodeId!==node.id){
      status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'migration-required',reason:'provenance-target-mismatch'});continue;
    }
    if(!local){status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'deleted-local'});continue;}
    const currentFingerprint=subtreeFingerprint(local.source);
    if(currentFingerprint!==base.lastGeneratedFingerprint){
      if(capability.sourceFingerprint===base.sourceFingerprint){
        status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'locally-modified-preserved'});
      }else{
        const artifact={figmaNodeId:node.id,slideId:scene.id,studioId:id,reason:'source-and-local-conflict',
          existingLocalSubtree:local.source,lastGeneratedFingerprint:base.lastGeneratedFingerprint,
          currentLocalFingerprint:currentFingerprint,newFigmaFingerprint:capability.sourceFingerprint,
          proposedGeneratedSubtree:proposed};
        const output=conflictFile(out,scene.id,id);fs.mkdirSync(path.dirname(output),{recursive:true});json(output,artifact);
        status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'source-and-local-conflict',
          artifact:path.relative(out,output).replaceAll('\\','/')});
      }
      continue;
    }
    if(local.source===proposed&&capability.sourceFingerprint===base.sourceFingerprint){
      status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'unchanged'});continue;
    }
    edits.push({span:local,node,capability,source:proposed});
    status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,status:'regenerated'});
  }
  for(const [id,base] of priorRecords){
    if(base.sourceFile===sourceFile&&!currentNodes.has(id))status(report,{slideId:scene.id,figmaNodeId:base.figmaNodeId,studioId:id,
      status:structural.objects?.[id]?.state&&structural.objects[id].state!=='active'?'source-removed-local-structural-conflict':'source-removed'});
  }
  if(!edits.length&&!insertions.length)return;
  let next=current;
  const patches=edits.map(e=>({start:e.span.start,end:e.span.end,text:e.source}));
  if(insertions.length){
    const marker=current.indexOf(INSERT);
    if(marker<0)throw Error('insertion-anchor-absent');
    patches.push({start:marker,end:marker,text:insertions.map(x=>x.source).join('\n\n')+'\n\n'});
  }
  for(const p of patches.sort((a,b)=>b.start-a.start))next=next.slice(0,p.start)+p.text+next.slice(p.end);
  try{
    const verified=validateManagedPage(next);
    for(const e of [...edits,...insertions]){
      if(e.fallback){if(verified.has(studioId(e.node.id))||!next.includes(`data-figma-node-id="${e.node.id}"`))throw Error(`Invalid fallback replacement ${e.node.id}`);}
      else if(!verified.has(studioId(e.node.id)))throw Error(`Missing patched StudioText ${e.node.id}`);
    }
    atomicPageWrite(file,current,next);
    for(const e of [...edits,...insertions]){
      if(e.fallback)records.delete(studioId(e.node.id));
      else records.set(studioId(e.node.id),record(e.node,scene,sourceFile,e.capability,e.source));
    }
  }catch(error){
    for(const e of [...edits,...insertions]){
      const item=report.objects.findLast(row=>row.slideId===scene.id&&row.studioId===studioId(e.node.id));
      if(item){report.counts[item.status]--;item.status='error';item.reason=String(error);report.counts.error=(report.counts.error??0)+1;}
    }
  }
}
export function regenerateProject({out,scenes,assets,migrate=false,inputSha}){
  const indexFile=path.join(out,'data','slides','index.json'),provenanceFile=path.join(out,'data','conversion-provenance.json');
  if(!fs.existsSync(indexFile))throw Error('Existing output is not a recognized generated project; nothing changed');
  const index=read(indexFile),pageBySlide=new Map(index.map(row=>[row.id,row.page]));
  const report={schemaVersion:1,mode:migrate?'explicit-DeckText-migration':'safe-in-place-regeneration',
    counts:Object.fromEntries(REPORT_STATES.map(state=>[state,0])),objects:[],diagnostics:[]};
  if(migrate&&!fs.existsSync(provenanceFile))return migrateLegacyProject({out,scenes,assets,inputSha,index,report});
  let previous={schemaVersion:PROVENANCE_SCHEMA,objects:[]};
  if(fs.existsSync(provenanceFile))previous=read(provenanceFile);
  else if(!migrate){
    for(const scene of scenes)for(const node of nodes(scene))if(node.runs)status(report,{slideId:scene.id,figmaNodeId:node.id,
      studioId:studioId(node.id),status:'migration-required',reason:'project-provenance-absent'});
    json(path.join(out,'regeneration-report.json'),report);return report;
  }
  if(previous.schemaVersion!==PROVENANCE_SCHEMA||!Array.isArray(previous.objects))throw Error('Unsupported provenance manifest');
  const structuralFile=path.join(out,'data/structural-provenance.json');
  const structural=fs.existsSync(structuralFile)?read(structuralFile):{schemaVersion:1,objects:{},slides:{}};
  if(structural.schemaVersion!==1)throw Error('Unsupported structural provenance');
  const records=new Map(previous.objects.map(row=>[row.studioId,row])),priorRecords=new Map(records);
  for(const scene of scenes){
    const sourceFile=pageBySlide.get(scene.id);
    if(!sourceFile){for(const node of nodes(scene))if(node.runs){
      const id=studioId(node.id),baseline=priorRecords.get(id),locallyDeleted=structural.slides?.[scene.id]?.state==='deleted';
      status(report,{slideId:scene.id,figmaNodeId:node.id,studioId:id,
        status:locallyDeleted?(baseline&&baseline.sourceFingerprint!==textFingerprint(node)?'source-and-local-structural-conflict':'local-structural-preserved'):'migration-required',
        reason:locallyDeleted?'slide-deleted-local':'slide-id-not-in-project'});
    }continue;}
    const file=safePage(out,sourceFile);
    if(!fs.existsSync(file)){for(const node of nodes(scene))if(node.runs)status(report,{slideId:scene.id,figmaNodeId:node.id,
      studioId:studioId(node.id),status:'error',reason:'page-missing'});continue;}
    patchPage({out,scene,sourceFile,priorRecords,records,assets,report,structural});
  }
  const presentSlides=new Set(scenes.map(scene=>scene.id));
  for(const old of previous.objects)if(!presentSlides.has(old.slideId))status(report,{slideId:old.slideId,figmaNodeId:old.figmaNodeId,
    studioId:old.studioId,status:structural.objects?.[old.studioId]?.state&&structural.objects[old.studioId].state!=='active'
      ?'source-removed-local-structural-conflict':'source-removed'});
  const objects=[...records.values()].sort((a,b)=>a.sourceFile.localeCompare(b.sourceFile)||a.studioId.localeCompare(b.studioId));
  json(provenanceFile,{schemaVersion:PROVENANCE_SCHEMA,objects});
  let structuralChanged=false;
  for(const item of report.objects.filter(x=>x.status==='source-removed'||x.status==='source-removed-local-structural-conflict')){
    const base=priorRecords.get(item.studioId);if(!base)continue;
    const old=structural.objects[item.studioId];
    if(!old){structural.objects[item.studioId]={origin:'imported',state:'source-removed',sourceSlideId:base.slideId,
      currentSlideId:base.slideId,sourceFile:base.sourceFile,sourceFingerprint:base.sourceFingerprint,sourceRemoved:true};structuralChanged=true;}
    else if(!old.sourceRemoved){old.sourceRemoved=true;structuralChanged=true;}
  }
  if(structuralChanged){structural.nextId??=1;structural.slides??={};json(structuralFile,structural);}
  report.objects.sort((a,b)=>a.slideId.localeCompare(b.slideId)||a.studioId.localeCompare(b.studioId));
  report.diagnostics.sort((a,b)=>a.slideId.localeCompare(b.slideId)||a.studioId.localeCompare(b.studioId)||a.code.localeCompare(b.code));
  report.counts=Object.fromEntries(Object.entries(report.counts).sort(([a],[b])=>a.localeCompare(b)));
  json(path.join(out,'regeneration-report.json'),report);
  return report;
}
