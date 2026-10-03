#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseFigBinary} from 'openfig-core';
import {ZipArchive,detectMime,extension} from '../lib/zip.mjs';
import {buildScenes} from '../lib/scene.mjs';
import {appearanceSummary} from '../lib/appearance.mjs';
import {layerProvenanceForPage} from '../lib/managed-layer.mjs';
import {regenerateLayers} from '../lib/regenerate-layers.mjs';
import {classifyScenes} from '../lib/classify.mjs';
import {renderPage,renderSlidesMd,renderLayout} from '../lib/render-semantic.mjs';
import {provenanceForPage,regenerateProject} from '../lib/regenerate.mjs';
import {StructuralTransactionStore} from '../lib/structural-transaction.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const usage=`Usage: npm run convert -- INPUT.deck [--out OUTPUT_DIR] [--limit N] [--strict] [--build] [--migrate-studiotext]\n\nWithout --out, output is INPUT-slidev next to the deck. New output is generated normally. Existing output uses provenance-aware object-level regeneration; legacy DeckText migration requires --migrate-studiotext. The input .deck is read-only.\n`;
function args(argv){if(!argv.length||argv.includes('--help')||argv.includes('-h')){console.log(usage);process.exit(0);}
  let input=null,out=null,limit=null,strict=false,build=false,migrate=false;
  for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--out')out=argv[++i];else if(a==='--limit')limit=Number(argv[++i]);else if(a==='--strict')strict=true;else if(a==='--build')build=true;else if(a==='--migrate-studiotext')migrate=true;else if(a.startsWith('-'))throw Error(`Unknown option ${a}`);else if(!input)input=a;else throw Error(`Unexpected argument ${a}`);}
  if(!input)throw Error('Input .deck is required');if(limit!==null&&(!Number.isSafeInteger(limit)||limit<1))throw Error('--limit must be a positive integer');
  const source=path.resolve(input),target=out?path.resolve(out):path.join(path.dirname(source),path.basename(source,path.extname(source))+'-slidev');
  return{input:source,out:target,limit,strict,build,migrate};}
const writeJson=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const pad=n=>String(n).padStart(3,'0');
function countNodes(s){const tally={text:0,media:0,video:0,gif:0,vector:0};const walk=n=>{if(n.runs)tally.text++;if(n.media){tally.media++;if(n.media.kind==='video')tally.video++;if(n.media.kind==='gif')tally.gif++;}if(n.type==='VECTOR'&&n.paths?.length)tally.vector++;n.children.forEach(walk);};s.children.forEach(walk);return tally;}
async function fileHash(p){const hash=createHash('sha256');for await(const b of fs.createReadStream(p))hash.update(b);return hash.digest('hex');}
function copyTemplate(staging){
  for(const name of ['DeckText.vue','DeckImage.vue','DeckVideo.vue','DeckShape.vue','DeckGroup.vue','SlideNavigation.vue','StudioText.vue','StudioRun.vue','StudioParagraph.vue','StudioLayer.vue','studio-decoration.ts','font-settings.ts','shared-text-styles.ts'])fs.copyFileSync(path.join(root,'template','components',name),path.join(staging,'components',name));
  fs.copyFileSync(path.join(root,'template','verify.mjs'),path.join(staging,'verify.mjs'));
  fs.copyFileSync(path.join(root,'template','install-slidev.mjs'),path.join(staging,'install-slidev.mjs'));
  fs.copyFileSync(path.join(root,'template','start-slidev.ps1'),path.join(staging,'start-slidev.ps1'));
  fs.copyFileSync(path.join(root,'template','vite.config.ts'),path.join(staging,'vite.config.ts'));
  fs.mkdirSync(path.join(staging,'vendor'),{recursive:true});
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'template','studio-contract.json'),'utf8'));
  const tarball=`slidev-addon-studio-${metadata.studioPackageVersion}.tgz`;
  const sourceTar=path.join(root,'template','vendor',tarball),tarBytes=fs.readFileSync(sourceTar);
  if(createHash('sha256').update(tarBytes).digest('hex')!==metadata.studioTarballSha256)throw Error('Pinned Studio tarball hash mismatch');
  fs.writeFileSync(path.join(staging,'vendor',tarball),tarBytes);
  writeJson(path.join(staging,'data','converter-metadata.json'),metadata);
  const lock=JSON.parse(fs.readFileSync(path.join(root,'template','package-lock.json'),'utf8'));
  lock.name='converted-deck-slidev';lock.packages[''].name='converted-deck-slidev';
  const dev=lock.packages[''].devDependencies;
  writeJson(path.join(staging,'package.json'),{name:'converted-deck-slidev',private:true,type:'module',scripts:{setup:'node install-slidev.mjs',dev:'slidev',build:'slidev build',verify:'node verify.mjs'},slidev:{addons:['slidev-addon-studio']},devDependencies:dev});
  writeJson(path.join(staging,'package-lock.json'),lock);
}
function buildProject(project){
  const install=spawnSync(process.execPath,[path.join(project,'install-slidev.mjs')],{cwd:project,stdio:'inherit'});
  if(install.status!==0)throw Error(`Slidev installation failed${install.error?`: ${install.error}`:''}`);
  const runtimeDir=path.join(project,'.slidev-runtime');
  const env={...process.env,TEMP:runtimeDir,TMP:runtimeDir,TMPDIR:runtimeDir,npm_config_cache:path.join(runtimeDir,'npm-cache')};
  const npmCli=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  for(const arg of [['run','build'],['run','verify']]){
    const nodeNpm=fs.existsSync(npmCli),cmd=nodeNpm?process.execPath:'npm',argv=nodeNpm?[npmCli,...arg]:arg;
    const result=spawnSync(cmd,argv,{cwd:project,env,stdio:'inherit',shell:!nodeNpm&&process.platform==='win32'});
    if(result.status!==0)throw Error(`npm ${arg.join(' ')} failed${result.error?`: ${result.error}`:''}`);
  }
}
async function convert(options){
  const {input,out,limit,strict,build,migrate}=options;
  if(!fs.existsSync(input)||!fs.statSync(input).isFile())throw Error(`No input file: ${input}`);
  const contains=(parent,child)=>{const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));};
  if(contains(out,input)||contains(out,root))throw Error('Output may not contain the source deck or converter installation');
  if(fs.existsSync(out)){
    if(!fs.statSync(out).isDirectory())throw Error(`Output is not a directory: ${out}`);
    await new StructuralTransactionStore(out).recover();
    const zip=await ZipArchive.open(input);
    try{
      const canvasEntry=zip.byName.get('canvas.fig');if(!canvasEntry)throw Error('canvas.fig is absent');
      const canvas=(await zip.extract(canvasEntry,{buffer:true})).bytes;
      const doc=parseFigBinary(new Uint8Array(canvas.buffer,canvas.byteOffset,canvas.byteLength));
      const model=buildScenes(doc,zip.entries,{limit});
      const assets=new Map(JSON.parse(fs.readFileSync(path.join(out,'data','assets.json'),'utf8')).map(row=>[row.name,row]));
      const archive=JSON.parse(fs.readFileSync(path.join(out,'data','archive.json'),'utf8'));
      classifyScenes([...model.scenes,...model.skippedScenes],assets,archive,model.warnings);
      const result=regenerateProject({out,scenes:[...model.scenes,...model.skippedScenes],assets,migrate,inputSha:await fileHash(input)});
      result.layers=regenerateLayers({out,scenes:[...model.scenes,...model.skippedScenes],assets});
      console.log(JSON.stringify({output:out,mode:result.mode,counts:result.counts,layerCounts:result.layers.counts,report:path.join(out,'regeneration-report.json'),layerReport:path.join(out,'layer-regeneration-report.json')},null,2));
      if(build)buildProject(out);
      return;
    }finally{await zip.close();}
  }
  if(migrate)throw Error('--migrate-studiotext requires an existing generated output');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const staging=out+`.partial-${process.pid}`;
  if(fs.existsSync(staging))throw Error(`Staging directory already exists: ${staging}`);
  fs.mkdirSync(staging);for(const dir of ['pages','pages/skipped','data','data/slides','public','public/media','layouts','components'])fs.mkdirSync(path.join(staging,dir),{recursive:true});
  let zip;
  try{
    zip=await ZipArchive.open(input);
    const canvasEntry=zip.byName.get('canvas.fig');if(!canvasEntry)throw Error('canvas.fig is absent');
    const canvas=(await zip.extract(canvasEntry,{buffer:true})).bytes;
    fs.writeFileSync(path.join(staging,'data','canvas.fig'),canvas);
    const doc=parseFigBinary(new Uint8Array(canvas.buffer,canvas.byteOffset,canvas.byteLength));
    const model=buildScenes(doc,zip.entries,{limit});
    const warnings=[...model.warnings];
    console.log(`Kiwi ${doc.header.version}: ${model.activeCount} active slides, ${model.skippedScenes.length} skipped; generating ${model.scenes.length} active slides`);
    const assets=new Map(),archive=[];
    for(let i=0;i<zip.entries.length;i++){
      const entry=zip.entries[i];if(entry.directory){archive.push({name:entry.name,directory:true});continue;}
      const selected=model.refs.has(entry.name),temp=selected?path.join(staging,'public','media',`${path.basename(entry.name)}.part`):null;
      const result=await zip.extract(entry,{to:temp});const mime=detectMime(result.magic);
      const record={name:entry.name,directory:false,compressionMethod:entry.method,compressedSize:entry.compressed,uncompressedSize:result.size,crc32:result.crc32,sha1:result.sha1,sha256:result.sha256,mime,selected};archive.push(record);
      if(/^(images|videos)\/[0-9a-f]{40}$/.test(entry.name)&&path.basename(entry.name)!==result.sha1)throw Error(`Content hash mismatch: ${entry.name}`);
      if(selected){if(!extension[mime])throw Error(`Unsupported media type ${mime} for ${entry.name}`);
        const filename=path.basename(entry.name)+extension[mime],dest=path.join(staging,'public','media',filename);
        fs.renameSync(temp,dest);assets.set(entry.name,{...record,filename,url:`/media/${filename}`});
      }
      if((i+1)%40===0||i+1===zip.entries.length)console.log(`Validated ${i+1}/${zip.entries.length} ZIP entries`);
    }
    for(const member of model.refs)if(!assets.has(member))warnings.push({code:'unresolved-media-reference',member});
    const classification=classifyScenes([...model.scenes,...model.skippedScenes],assets,archive,warnings);
    const indexById=new Map(model.scenes.map((s,i)=>[s.id,i+1]));
    const interactions=[];
    for(const s of [...model.scenes,...model.skippedScenes]){
      for(const action of s.interactions){interactions.push({slideId:s.id,nodeId:s.id,...action});if(!s.skipped&&action.targetId&&!indexById.has(action.targetId))warnings.push({code:'navigation-target-not-active',slideId:s.id,targetId:action.targetId});}
      const walk=n=>{for(const action of n.interactions)interactions.push({slideId:s.id,nodeId:n.id,...action});n.children.forEach(walk);};s.children.forEach(walk);
    }
    const provenance=[],layerProvenance=[];
    for(let i=0;i<model.scenes.length;i++){
      const s=model.scenes[i],id=pad(i+1),dir=path.join(staging,'data','slides',id);fs.mkdirSync(dir,{recursive:true});
      const nav=s.interactions.find(a=>a.action==='NAVIGATE'&&a.event==='ON_CLICK'),target=nav?.targetId?indexById.get(nav.targetId)??null:null;
      const page=renderPage(s,assets,warnings,target);
      fs.writeFileSync(path.join(staging,'pages',`${id}.md`),page);
      provenance.push(...provenanceForPage(s,page,`pages/${id}.md`));
      layerProvenance.push(...layerProvenanceForPage(s,page,`pages/${id}.md`));
      writeJson(path.join(dir,'scene.json'),{...s,schemaVersion:1,notes:undefined});writeJson(path.join(dir,'notes.json'),s.notes);
      writeJson(path.join(dir,'media.json'),{slideId:s.id,placements:(()=>{const out=[];const walk=n=>{for(const media of n.mediaLayers??(n.media?[n.media]:[]))out.push({nodeId:n.id,...media});n.children.forEach(walk);};s.children.forEach(walk);return out;})()});
    }
    for(let i=0;i<model.skippedScenes.length;i++){const s=model.skippedScenes[i],id=pad(i+1),dir=path.join(staging,'data','slides',`skipped-${id}`);fs.mkdirSync(dir,{recursive:true});
      const page=renderPage(s,assets,warnings,null);
      fs.writeFileSync(path.join(staging,'pages','skipped',`${id}.md`),page);
      provenance.push(...provenanceForPage(s,page,`pages/skipped/${id}.md`));
      layerProvenance.push(...layerProvenanceForPage(s,page,`pages/skipped/${id}.md`));
      writeJson(path.join(dir,'scene.json'),{...s,schemaVersion:1,notes:undefined});writeJson(path.join(dir,'notes.json'),s.notes);
      writeJson(path.join(dir,'media.json'),{slideId:s.id,placements:(()=>{const out=[];const walk=n=>{for(const media of n.mediaLayers??(n.media?[n.media]:[]))out.push({nodeId:n.id,...media});n.children.forEach(walk);};s.children.forEach(walk);return out;})()});
    }
    const slideIndex=[...model.scenes.map((s,i)=>({id:s.id,label:s.label,skipped:false,order:i+1,page:`pages/${pad(i+1)}.md`,data:`data/slides/${pad(i+1)}`,notesStatus:s.notes.status,counts:countNodes(s)})),...model.skippedScenes.map((s,i)=>({id:s.id,label:s.label,skipped:true,order:null,page:`pages/skipped/${pad(i+1)}.md`,data:`data/slides/skipped-${pad(i+1)}`,notesStatus:s.notes.status,counts:countNodes(s)}))];
    writeJson(path.join(staging,'data','slides','index.json'),slideIndex);
    const title=model.scenes[0].label||path.basename(input,'.deck');
    fs.writeFileSync(path.join(staging,'slides.md'),renderSlidesMd(model.scenes,model.canvas,title));
    fs.writeFileSync(path.join(staging,'layouts','figma.vue'),renderLayout(model.canvas));
    copyTemplate(staging);
    const seenStudio=new Set();for(const row of provenance){if(seenStudio.has(row.studioId))throw Error(`Duplicate generated StudioText ID ${row.studioId}`);seenStudio.add(row.studioId);}
    writeJson(path.join(staging,'data','conversion-provenance.json'),{schemaVersion:1,objects:provenance.sort((a,b)=>a.sourceFile.localeCompare(b.sourceFile)||a.studioId.localeCompare(b.studioId))});
    writeJson(path.join(staging,'data','layer-provenance.json'),{schemaVersion:1,objects:layerProvenance.sort((a,b)=>a.sourceFile.localeCompare(b.sourceFile)||a.objectId.localeCompare(b.objectId))});
    writeJson(path.join(staging,'data','assets.json'),[...assets.values()]);
    writeJson(path.join(staging,'data','archive.json'),archive);
    writeJson(path.join(staging,'data','interactions.json'),interactions);
    for(const record of classification.records)record.warnings=warnings.filter(w=>w.nodeId===record.nodeId).map(w=>w.code);
    writeJson(path.join(staging,'data','classification.json'),classification);
    const sourceHash=await fileHash(input);
    const sumCounts=rows=>rows.reduce((a,s)=>{for(const [k,v]of Object.entries(s.counts))a[k]=(a[k]??0)+v;return a;},{});
    const mixedIds=new Set();const mixedWalk=n=>{if(n.runs?.length>1)mixedIds.add(n.id);for(const child of n.children)mixedWalk(child);};for(const s of [...model.scenes,...model.skippedScenes])for(const n of s.children)mixedWalk(n);
    const report={toolVersion:'0.6.1',source:{file:path.basename(input),size:fs.statSync(input).size,sha256:sourceHash},kiwi:{prelude:doc.header.prelude,version:doc.header.version,nodeCount:doc.nodes.length},archiveEntryCount:archive.length,slides:{active:model.activeCount,generated:model.scenes.length,skipped:model.skippedScenes.length},canvas:model.canvas,counts:sumCounts(slideIndex.filter(s=>!s.skipped)),skippedCounts:sumCounts(slideIndex.filter(s=>s.skipped)),classificationCounts:classification.records.reduce((a,r)=>(a[r.presentationKind]=(a[r.presentationKind]??0)+1,a),{}),notesStatusCounts:slideIndex.reduce((a,s)=>(a[s.notesStatus]=(a[s.notesStatus]??0)+1,a),{}),assetCount:assets.size,assetBytes:[...assets.values()].reduce((a,x)=>a+x.uncompressedSize,0),text:{studioText:provenance.length,mixedRuns:provenance.filter(row=>mixedIds.has(row.figmaNodeId)).length,unsupported:warnings.filter(w=>w.code==='unsupported-text').length},warnings,strictPassed:warnings.length===0};
    report.appearance=appearanceSummary([...model.scenes,...model.skippedScenes]);
    report.layers={ownership:'layer-geometry-only',count:layerProvenance.length,byKind:layerProvenance.reduce((o,r)=>(o[r.kind]=(o[r.kind]??0)+1,o),{}),byCapability:layerProvenance.reduce((o,r)=>(o[r.capabilities.level]=(o[r.capabilities.level]??0)+1,o),{})};
    writeJson(path.join(staging,'conversion-report.json'),report);
    fs.writeFileSync(path.join(staging,'README.md'),`# Converted Figma Slides deck\n\nSource: ${path.basename(input)}\n\nRequires Node.js 22.12 or later. Run \`node install-slidev.mjs\` to install locked dependencies. The accepted Studio fork is bundled in \`vendor/\`, and no installed package is patched. Run \`npm run dev\` or \`.\\start-slidev.ps1\` on Windows, then open the local Slidev URL. Press \`E\` or click Studio. Select a StudioText box for geometry and typography; double-click to edit its text. Pages are editable Markdown and presenter notes remain in each page's final HTML comment.\n\n${report.slides.generated} active slides are imported by \`slides.md\`. ${report.slides.skipped} skipped slides are in \`pages/skipped/\`. \`data/conversion-provenance.json\` tracks generated StudioText objects and exact source fingerprints. Converter reruns patch only unmodified managed objects and write \`regeneration-report.json\`; local edits and conflicts are preserved. \`data/slides/index.json\` maps source slide IDs to pages, scene evidence, media and notes. \`data/classification.json\` records source evidence; exact Kiwi and media bytes remain in \`data/canvas.fig\` and \`public/media/\`. Run \`npm run verify\` for source/asset checks. Unsupported text retains an explicit fallback; see \`conversion-report.json\`.\n`);
    if(strict&&warnings.length)throw Error(`Strict conversion rejected ${warnings.length} fidelity warnings; inspect ${staging}/conversion-report.json`);
    if(build)buildProject(staging);
    fs.renameSync(staging,out);
    console.log(JSON.stringify({output:out,slides:report.slides,counts:report.counts,assets:report.assetCount,warnings:warnings.length,report:path.join(out,'conversion-report.json')},null,2));
  }finally{await zip?.close();}
}
try{await convert(args(process.argv.slice(2)));}catch(e){console.error(`Conversion failed: ${e.stack??e}`);process.exitCode=1;}
