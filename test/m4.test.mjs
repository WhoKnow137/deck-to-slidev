import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeStudioText,canonicalJson,textFingerprint,subtreeFingerprint,studioId} from '../lib/studio-text.mjs';
import {parseStudioText} from '../lib/studio-contract.mjs';
import {renderPage} from '../lib/render-semantic.mjs';
import {renderPage as renderLegacyPage} from '../lib/render-semantic-legacy.mjs';
import {provenanceForPage,regenerateProject} from '../lib/regenerate.mjs';

const json=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const node=(text='Hello  🌍\nworld',overrides={})=>({id:'2085:89',type:'TEXT',name:'Title',presentationKind:'text',children:[],
  text,rawText:text,runs:[{text,fontFamily:'Inter Tight',fontSize:48,fontWeight:400,fontStyle:'normal',color:'#ffffff',decoration:'NONE'}],
  fontFamily:'Inter Tight',fontSize:48,fontWeight:400,fontStyle:'normal',color:'#ffffff',decoration:'NONE',textCase:'ORIGINAL',
  lineHeight:{value:1.2,units:'RAW'},letterSpacing:{value:-1.25,units:'PIXELS'},align:'CENTER',verticalAlign:'TOP',
  textAutoResize:'HEIGHT',size:{x:400,y:120},transform:{m00:1,m01:0,m02:10,m10:0,m11:1,m12:20},opacity:1,visible:true,...overrides});
const scene=(item=node())=>({id:'2085:56',background:'#000',notes:{status:'present',blocks:[{text:'Speaker note'}]},children:[item]});
const fixture=()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'deck-m4-'));
  const s=scene(),page=renderPage(s,new Map(),[]),file=path.join(out,'pages','001.md');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,page);
  json(path.join(out,'data','slides','index.json'),[{id:s.id,page:'pages/001.md',data:'data/slides/001'}]);
  json(path.join(out,'data','conversion-provenance.json'),{schemaVersion:1,objects:provenanceForPage(s,page,'pages/001.md')});
  return {out,s,file,page,read:()=>fs.readFileSync(file,'utf8'),run:(scenes=[s])=>regenerateProject({out,scenes,assets:new Map(),inputSha:'test'})};
};
test('StudioText maps Unicode, spaces, runs, paragraphs, styles and geometry through accepted contract',()=>{
  const n=node(' A  🌍\nB ',{runs:[
    {text:' A  🌍\n',fontFamily:'Inter Tight',fontSize:48,fontWeight:400,fontStyle:'normal',color:'#ffffff',decoration:'NONE'},
    {text:'B ',fontFamily:'Inter Tight',fontSize:60,fontWeight:700,fontStyle:'italic',color:'#ff3344',decoration:'UNDERLINE_AND_STRIKETHROUGH'}],
    paragraphLines:[{lineType:'PLAIN',align:'LEFT'},{lineType:'PLAIN',align:'CENTER'}],textAutoResize:'WIDTH_AND_HEIGHT'});
  const a=analyzeStudioText(n);assert.equal(a.supported,true,a.reason);
  assert.match(a.source,/id="figma-2085-89"/);assert.match(a.source,/resize="auto-width"/);
  assert.match(a.source,/<StudioParagraph/);assert.match(a.source,/<StudioRun/);
  const p=parseStudioText(a.source);assert.equal(p.ok,true,p.reason);
  assert.equal(p.document.paragraphs.map(x=>x.runs.map(y=>y.text).join('')).join('\n'),n.rawText);
  assert.equal(p.document.defaults.fontFamily,'Inter Tight');
  assert.equal(p.document.geometry.x,10);assert.equal(p.document.geometry.y,20);
  assert.equal(p.document.paragraphs[1].runs[0].overrides.fontWeight,700);
  assert.equal(p.document.paragraphs[1].runs[0].overrides.decoration,'underline line-through');
  assert.equal(p.document.defaults.letterSpacing,'-1.25px');
  const relative=analyzeStudioText({...n,letterSpacing:{value:12.5,units:'PERCENT'}});
  assert.equal(relative.supported,true,relative.reason);
  assert.equal(parseStudioText(relative.source).document.defaults.letterSpacing,'0.125em');
  const cased=analyzeStudioText({...n,textCase:'UPPER'});
  assert.equal(cased.supported,true,cased.reason);
  assert.equal(parseStudioText(cased.source).document.defaults.textCase,'uppercase');
  assert.equal(cased.document.paragraphs.map(x=>x.runs.map(y=>y.text).join('')).join('\n'),n.rawText);
  assert.equal(textFingerprint(n),textFingerprint({...n,runs:n.runs.map(r=>({color:r.color,text:r.text,fontSize:r.fontSize,fontStyle:r.fontStyle,fontWeight:r.fontWeight,fontFamily:r.fontFamily,decoration:r.decoration}))}));
  assert.notEqual(subtreeFingerprint(a.source),subtreeFingerprint(a.source+' '));
  assert.equal(canonicalJson({b:1,a:2}),canonicalJson({a:2,b:1}));
});
test('unsupported text keeps explicit fallback reason',()=>{
  const bad=node('Hello',{visualLines:[{text:'Hello',x:0,top:0,fontFamily:'Inter',fontSize:48,fontWeight:400,color:'#fff'}]});
  const a=analyzeStudioText(bad);assert.equal(a.supported,false);assert.equal(a.reason,'positioned-or-control-text');
  const warnings=[],page=renderPage(scene(bad),new Map(),warnings);
  assert.match(page,/figma-text-fallback/);assert.equal(warnings[0].reason,a.reason);
});
test('resize metadata, normalized rotation, and affine read-only geometry are explicit',()=>{
  const base=node('X');
  const wide=analyzeStudioText({...base,textAutoResize:'WIDTH_AND_HEIGHT'});
  assert.equal(wide.supported,true);assert.match(wide.source,/pos="10,20,auto,auto" resize="auto-width"/);
  const tall=analyzeStudioText(base);
  assert.equal(tall.supported,true);assert.match(tall.source,/pos="10,20,400,auto" resize="auto-height"/);
  const fixed=analyzeStudioText({...base,textAutoResize:'NONE'});
  assert.equal(fixed.supported,true);assert.match(fixed.source,/pos="10,20,400,120" resize="fixed"/);
  const angle=220*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle);
  const rotated=analyzeStudioText({...base,transform:{m00:ca,m01:-sa,m02:10,m10:sa,m11:ca,m12:20}});
  assert.equal(rotated.supported,true);assert.equal(rotated.document.geometry.rotationDeg,-140);
  const affine=analyzeStudioText({...base,transform:{m00:1,m01:0.2,m02:10,m10:0,m11:1,m12:20}});
  assert.equal(affine.supported,true);assert.equal(affine.readOnlyTransform,true);assert.match(affine.source,/ affine="/);
  assert.equal(analyzeStudioText({...base,textAutoResize:'UNKNOWN'}).reason,'unsupported-resize-mode');
  assert.equal(analyzeStudioText({...base,decoration:'UNDERLINE_AND_GLOW'}).reason,'unsupported-decoration');
});
test('Figma newline creates paragraphs and U+2028 creates a soft break',()=>{
  const raw='First\u2028soft\nSecond';
  const n=node(raw,{paragraphLines:[{lineType:'PLAIN',align:'CENTER'},{lineType:'PLAIN',align:'CENTER'}]});
  const result=analyzeStudioText(n);assert.equal(result.supported,true,result.reason);
  assert.match(result.source,/<StudioParagraph>First<br \/>soft<\/StudioParagraph>/);
  assert.match(result.source,/<StudioParagraph>Second<\/StudioParagraph>/);
  const parsed=parseStudioText(result.source);assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.document.paragraphs.map(p=>p.runs.map(r=>r.text).join('')),['First\nsoft','Second']);
  assert.equal(analyzeStudioText({...n,paragraphLines:[{lineType:'PLAIN',align:'CENTER'}]}).reason,'unsupported-paragraph-boundaries');
});
test('regeneration preserves local text and unrelated Markdown byte-for-byte',()=>{
  const f=fixture();try{
    assert.equal(f.run().counts.unchanged,1);assert.equal(f.read(),f.page);
    const local=f.page.replace('Hello  🌍','Local  🌍').replace('<!-- figma-managed-insert -->','Custom markdown\n\n<!-- figma-managed-insert -->');
    fs.writeFileSync(f.file,local);
    assert.equal(f.run().counts['locally-modified-preserved'],1);assert.equal(f.read(),local);
    const changed=scene(node('Figma changed'));
    assert.equal(f.run([changed]).counts['source-and-local-conflict'],1);
    assert.equal(f.read(),local);
    const conflict=path.join(f.out,'data','conversion-conflicts','2085-56__figma-2085-89.json');
    const artifact=JSON.parse(fs.readFileSync(conflict,'utf8'));
    assert.match(artifact.proposedGeneratedSubtree,/Figma changed/);
    assert.match(artifact.existingLocalSubtree,/Local  🌍/);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('M6 structural tombstone and move survive rerun; changed source becomes explicit conflict',()=>{
  const f=fixture();try{
    const id=studioId(node().id),manifest=path.join(f.out,'data/structural-provenance.json');
    json(manifest,{schemaVersion:1,nextId:2,objects:{[id]:{origin:'imported',state:'deleted',sourceSlideId:f.s.id,
      currentSlideId:null,sourceFile:'pages/001.md'}},slides:{}});
    const deleted=f.page.replace(/<StudioText[^]*?<\/StudioText>/,'');fs.writeFileSync(f.file,deleted);
    assert.equal(f.run().counts['local-structural-preserved'],1);assert.equal(f.read(),deleted);
    const changed=scene(node('Changed upstream'));
    assert.equal(f.run([changed]).counts['source-and-local-structural-conflict'],1);assert.equal(f.read(),deleted);
    const overlay=JSON.parse(fs.readFileSync(manifest));overlay.objects[id].state='moved';overlay.objects[id].currentSlideId='other-slide';json(manifest,overlay);
    assert.equal(f.run([changed]).counts['source-and-local-structural-conflict'],1);assert.equal(f.read(),deleted);
    assert.equal(f.run([{...f.s,children:[]}]).counts['source-removed-local-structural-conflict'],1);
    assert.equal(JSON.parse(fs.readFileSync(manifest)).objects[id].sourceRemoved,true);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('M5 regeneration preserves advanced typography and keeps unproven Figma list fallbacks explicit',()=>{
  const f=fixture();try{
    const local=f.page.replace('resize="auto-height"','resize="auto-height" style-ref="local/hero" font-axes="{&quot;wght&quot;:620}" open-type="{&quot;tnum&quot;:true}"')
      .replace('<StudioParagraph>', '<StudioParagraph spacing-after="16" indent="24" list-kind="ordered" list-level="1" direction="rtl">');
    fs.writeFileSync(f.file,local);
    assert.equal(f.run().counts['locally-modified-preserved'],1);
    assert.equal(f.read(),local);
    const result=analyzeStudioText(node('List',{paragraphLines:[{lineType:'UNORDERED_LIST',indentationLevel:1,isFirstLineOfList:true}]}));
    assert.equal(result.supported,false);assert.equal(result.reason,'unsupported-paragraph-style');
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('changed Figma text regenerates untouched object and preserves notes',()=>{
  const f=fixture();try{
    const original=f.read(),changed=scene(node('Updated from Figma'));
    const result=f.run([changed]);assert.equal(result.counts.regenerated,1);
    assert.match(f.read(),/Updated from Figma/);
    assert.equal(f.read().slice(f.read().indexOf('<!-- figma-managed-insert -->')),original.slice(original.indexOf('<!-- figma-managed-insert -->')));
    assert.equal(f.run([changed]).counts.unchanged,1);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('missing provenance, duplicate ID, and local deletion never overwrite a page',()=>{
  const f=fixture();try{
    fs.rmSync(path.join(f.out,'data','conversion-provenance.json'));
    assert.equal(f.run().counts['migration-required'],1);assert.equal(f.read(),f.page);
    json(path.join(f.out,'data','conversion-provenance.json'),{schemaVersion:1,objects:provenanceForPage(f.s,f.page,'pages/001.md')});
    const duplicated=f.page.replace('<!-- figma-managed-insert -->',`${analyzeStudioText(f.s.children[0]).source}\n\n<!-- figma-managed-insert -->`);
    fs.writeFileSync(f.file,duplicated);assert.equal(f.run().counts.error,1);assert.equal(f.read(),duplicated);
    fs.writeFileSync(f.file,f.page.replace(analyzeStudioText(f.s.children[0]).source,''));
    const deleted=f.read();assert.equal(f.run().counts['deleted-local'],1);assert.equal(f.read(),deleted);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('new source object is inserted while source-removed object remains',()=>{
  const f=fixture();try{
    const added=node('Second',{id:'2085:90'}),s=scene();s.children.push(added);
    assert.equal(f.run([s]).counts.generated,1);assert.match(f.read(),/id="figma-2085-90"/);
    const prior=f.read();const removed=scene(added);
    assert.equal(f.run([removed]).counts['source-removed'],1);assert.equal(f.read(),prior);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('an untouched managed object safely becomes fallback when source is unsupported',()=>{
  const f=fixture();try{
    const unsupported=scene(node('Hello  🌍\nworld',{decoration:'UNSUPPORTED_GLOW'}));
    const result=f.run([unsupported]);
    assert.equal(result.counts.unsupported,1);
    assert.equal(result.objects[0].action,'replaced-untouched-StudioText-with-fallback');
    assert.match(f.read(),/figma-text-fallback/);assert.doesNotMatch(f.read(),/<StudioText/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'data','conversion-provenance.json'),'utf8')).objects.length,0);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('a locally edited object stays intact when source becomes unsupported',()=>{
  const f=fixture();try{
    const local=f.page.replace('Hello  🌍','Local  🌍');fs.writeFileSync(f.file,local);
    const unsupported=scene(node('Hello  🌍\nworld',{decoration:'UNSUPPORTED_GLOW'}));
    const result=f.run([unsupported]);assert.equal(result.counts['source-and-local-conflict'],1);
    assert.equal(f.read(),local);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('new unsupported top-level text inserts fallback without taking page ownership',()=>{
  const f=fixture();try{
    const s=scene(),bad=node('New',{id:'2085:90',decoration:'UNSUPPORTED_GLOW'});s.children.push(bad);
    const result=f.run([s]);assert.equal(result.counts.unsupported,1);
    assert.equal(result.objects.find(x=>x.figmaNodeId==='2085:90').action,'inserted-new-fallback');
    assert.match(f.read(),/data-figma-node-id="2085:90"/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'data','conversion-provenance.json'),'utf8')).objects.length,1);
    assert.equal(f.run([s]).counts.unsupported,1);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('independent objects on one page patch safely while another conflicts',()=>{
  const f=fixture();try{
    const second=node('Second',{id:'2085:90'}),initial=scene();initial.children.push(second);
    const initialPage=renderPage(initial,new Map(),[]);fs.writeFileSync(f.file,initialPage);
    json(path.join(f.out,'data','conversion-provenance.json'),{schemaVersion:1,objects:provenanceForPage(initial,initialPage,'pages/001.md')});
    const local=initialPage.replace('Hello  🌍','Local  🌍');fs.writeFileSync(f.file,local);
    const incoming=scene(node('Figma changed'));incoming.children.push(node('Second changed',{id:'2085:90'}));
    const result=f.run([incoming]);
    assert.equal(result.counts['source-and-local-conflict'],1);assert.equal(result.counts.regenerated,1);
    assert.match(f.read(),/Local  🌍/);assert.match(f.read(),/Second changed/);
    assert.match(f.read(),/Speaker note/);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
test('one-time DeckText migration accepts only exact known generated pages and source hash',()=>{
  const f=fixture();try{
    fs.rmSync(path.join(f.out,'data','conversion-provenance.json'));
    const old=renderLegacyPage(f.s,new Map(),[]);
    fs.writeFileSync(f.file,old);
    json(path.join(f.out,'data','slides','001','scene.json'),{...f.s,notes:undefined});
    json(path.join(f.out,'data','slides','001','notes.json'),f.s.notes);
    json(path.join(f.out,'conversion-report.json'),{toolVersion:'0.2.0',source:{sha256:'test'}});
    json(path.join(f.out,'package.json'),{name:'converted-deck-slidev',private:true,type:'module',
      scripts:{setup:'node install-slidev.mjs',predev:'node patch-studio.mjs',dev:'slidev',prebuild:'node patch-studio.mjs',build:'slidev build',verify:'node verify.mjs'},
      slidev:{addons:['slidev-addon-studio']},devDependencies:{'@fontsource/inter':'^5.3.0','@fontsource/inter-tight':'^5.3.0',
        '@fontsource/nanum-myeongjo':'^5.3.0','@slidev/cli':'^53.0.0','@slidev/theme-default':'^0.25.0','slidev-addon-studio':'0.3.1'}});
    assert.equal(f.run().counts['migration-required'],1);assert.equal(f.read(),old);
    const result=regenerateProject({out:f.out,scenes:[f.s],assets:new Map(),migrate:true,inputSha:'test'});
    assert.equal(result.counts.regenerated,1);assert.match(f.read(),/<StudioText/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'package.json'),'utf8')).scripts.predev,undefined);
    assert.equal(f.run().counts.unchanged,1);
  }finally{fs.rmSync(f.out,{recursive:true,force:true});}
});
