import {nodeId, resolveVectorNodePaths} from 'openfig-core';
import {generatedAppearance,mediaCorners,mediaProjection} from './appearance.mjs';

export const guid=g=>g?`${g.sessionID}:${g.localID}`:null;
export const identity={m00:1,m01:0,m02:0,m10:0,m11:1,m12:0};
export const hex=x=>x instanceof Uint8Array&&x.length===20?Buffer.from(x).toString('hex'):null;
const position=n=>n.parentIndex?.position??'';
const rank=(a,b)=>position(a)<position(b)?-1:position(a)>position(b)?1:0;
const norm=s=>String(s??'').replaceAll('\r\n','\n').replaceAll('\r','\n');
const color=p=>p?.type==='SOLID'&&p.color?`rgba(${Math.round(p.color.r*255)},${Math.round(p.color.g*255)},${Math.round(p.color.b*255)},${(p.color.a??1)*(p.opacity??1)})`:null;
const visiblePaints=n=>(n.fillPaints??[]).filter(p=>p.visible!==false);
const fontFamily=s=>s==='NanumMyeongjo'?'Nanum Myeongjo':s??'Inter Tight';
const fontWeight=s=>/thin/i.test(s??'')?100:/extra.?light|ultra.?light/i.test(s??'')?200:/light/i.test(s??'')?300:/medium/i.test(s??'')?500:/semi.?bold|demi.?bold/i.test(s??'')?600:/extra.?bold|ultra.?bold/i.test(s??'')?800:/black|heavy/i.test(s??'')?900:/bold/i.test(s??'')?700:400;
function richRuns(n){
  const t=n.textData??{},chars=String(t.characters??''),ids=t.characterStyleIDs??[],styles=new Map((t.styleOverrideTable??[]).map(x=>[x.styleID,x]));
  const glyphSizes=new Map((n.derivedTextData?.glyphs??[]).filter(g=>typeof g.firstCharacter==='number'&&typeof g.fontSize==='number').map(g=>[g.firstCharacter,g.fontSize]));
  const sizes=[];let size=n.fontSize??32;for(let i=0;i<chars.length;i++){size=glyphSizes.get(i)??size;sizes[i]=size;}
  const runs=[],key=i=>`${ids[i]??0}:${sizes[i]}`;
  for(let i=0;i<chars.length;){let end=i+1;while(end<chars.length&&key(end)===key(i))end++;
    const s=styles.get(ids[i]??0)??{};
    runs.push({text:chars.slice(i,end),fontFamily:fontFamily(s.fontName?.family??n.fontName?.family),fontWeight:fontWeight(s.fontName?.style??n.fontName?.style),fontStyle:/italic/i.test(s.fontName?.style??n.fontName?.style??'')?'italic':'normal',fontSize:sizes[i],color:color((s.fillPaints??[]).find(p=>p.visible!==false))??color(visiblePaints(n)[0])??'#fff',decoration:s.textDecoration??n.textDecoration??'NONE',textCase:s.textCase??n.textCase??'ORIGINAL',lineHeight:s.lineHeight??n.lineHeight??null,letterSpacing:s.letterSpacing??n.letterSpacing??null});i=end;
  }
  return runs;
}
function positionedLines(n){
  const chars=n.textData?.characters??'';if(!chars.includes('\r'))return null;
  const ids=n.textData.characterStyleIDs??[],styles=new Map((n.textData.styleOverrideTable??[]).map(x=>[x.styleID,x])),groups=new Map();
  for(const g of n.derivedTextData?.glyphs??[]){if(typeof g.firstCharacter!=='number'||!Number.isFinite(g.position?.y))continue;const y=g.position.y;if(!groups.has(y))groups.set(y,[]);groups.get(y).push(g);}
  const lines=[];for(const [baseline,glyphs] of groups){const valid=glyphs.filter(g=>!/[\r\n]/.test(chars[g.firstCharacter]??''));if(!valid.length)continue;
    const first=Math.min(...valid.map(g=>g.firstCharacter)),last=Math.max(...valid.map(g=>g.firstCharacter)),s=styles.get(ids[first]??0)??{},fontSize=valid[0].fontSize??n.fontSize??32;
    lines.push({text:chars.slice(first,last+1).replace(/[\r\n]/g,''),x:Math.min(...valid.map(g=>g.position.x)),top:baseline-fontSize*.9,fontSize,fontFamily:fontFamily(s.fontName?.family??n.fontName?.family),fontWeight:fontWeight(s.fontName?.style??n.fontName?.style),fontStyle:/italic/i.test(s.fontName?.style??n.fontName?.style??'')?'italic':'normal',color:color((s.fillPaints??[]).find(p=>p.visible!==false))??color(visiblePaints(n)[0])??'#fff',decoration:s.textDecoration==='UNDERLINE'?'underline':'none'});
  }
  return lines.length?lines:null;
}
function inlineText(x){if(!x||typeof x!=='object')return'';if(x.type==='text')return x.text??'';return(x.children??[]).map(inlineText).join('');}
export function decodeNotes(raw){
  if(raw==null)return{status:'absent',raw:null,parsed:null,blocks:[]};
  let parsed;try{parsed=JSON.parse(raw);}catch(e){return{status:'invalid',raw,parsed:null,blocks:[],error:String(e)};}
  const blocks=[];for(const child of parsed.root?.children??[]){if(child.type==='list')for(const item of child.children??[])blocks.push({type:'listitem',listType:child.listType??'bullet',value:item.value??null,text:inlineText(item)});else blocks.push({type:child.type,text:inlineText(child)});}
  return{status:blocks.some(x=>x.text.trim())?'present':'empty',raw,parsed,blocks};
}
export function formatNotes(note){let lines=[],list=false;for(const b of note.blocks){if(!b.text.trim())continue;
    if(b.type==='listitem'){if(!list&&lines.length)lines.push('');lines.push(`${b.listType==='number'?`${b.value??1}.`:'-'} ${b.text}`);list=true;}
    else{if(lines.length)lines.push('');lines.push(b.text);list=false;}}
  return lines.join('\n').replaceAll('-->','--&gt;').replaceAll('---','—');
}
function interactionList(n){const actions=[];for(const i of n.prototypeInteractions??[])for(const a of i.actions??[])actions.push({event:i.event?.interactionType??null,action:a.navigationType??a.mediaAction??null,targetId:guid(a.transitionNodeID),raw:a});return actions;}
function vectorPaths(doc,n,warnings){
  try{const paths=resolveVectorNodePaths(doc,n);return [...paths.fill.map(x=>({kind:'fill',d:x.svgPath,color:color((x.paints??n.fillPaints??[]).find(p=>p.visible!==false))??'#fff',windingRule:x.windingRule??'NONZERO'})),...paths.stroke.map(x=>({kind:'stroke',d:x.svgPath,color:color((x.paints??n.strokePaints??[]).find(p=>p.visible!==false))??'#fff'}))];}
  catch(e){warnings.push({code:'vector-decode',nodeId:nodeId(n),detail:String(e)});return[];}
}
function mediaFor(n,assetNames,warnings){
  const paints=visiblePaints(n).filter(p=>['IMAGE','VIDEO'].includes(p.type));if(!paints.length)return null;
  if(paints.length>1)warnings.push({code:'multiple-media-paints-render-last',nodeId:nodeId(n),count:paints.length});
  return paints.map((p,paintIndex)=>{
    const mainHash=hex(p.type==='VIDEO'?p.video?.hash:p.animatedImage?.hash??p.image?.hash),posterHash=hex(p.type==='VIDEO'?p.image?.hash:null);
    if(!mainHash)warnings.push({code:'missing-media-hash',nodeId:nodeId(n),paintIndex});
    const mainMember=mainHash?`${p.type==='VIDEO'?'videos':'images'}/${mainHash}`:null;
    if(mainMember&&!assetNames.has(mainMember))warnings.push({code:'missing-media-member',nodeId:nodeId(n),member:mainMember});
    const posterMember=posterHash?`images/${posterHash}`:null;
    if(posterMember&&!assetNames.has(posterMember))warnings.push({code:'missing-poster-member',nodeId:nodeId(n),member:posterMember});
    const media={kind:p.type==='VIDEO'?'video':p.animatedImage?'gif':'image',paintIndex,hash:mainHash,posterHash,member:mainMember,posterMember,mode:p.imageScaleMode??'FILL',paintTransform:p.transform??identity,opacity:p.opacity??1,original:{width:p.originalImageWidth??null,height:p.originalImageHeight??null},playback:n.videoPlayback??null};
    media.source={scope:'SOURCE-BACKED',sourceNodeId:nodeId(n),sourceNodeType:n.type,path:`fillPaints[${(n.fillPaints??[]).indexOf(p)}]`,rawPaint:p,rawMode:p.imageScaleMode??null,rawTransform:p.transform??null,intrinsicDimensions:{width:p.originalImageWidth??null,height:p.originalImageHeight??null}};
    media.rendererProjection=mediaProjection(media);
    return media;
  });
}
function stableNode(doc,n,byParent,byId,assetNames,warnings,context={}){
  const id=context.syntheticId??nodeId(n),fills=visiblePaints(n),size=n.size??{x:0,y:0};
  const out={id,type:n.type,name:n.name??'',parentId:guid(n.parentIndex?.guid),position:position(n),size,transform:n.transform??identity,opacity:n.opacity??1,visible:n.visible!==false,fill:color(fills.find(p=>p.type==='SOLID')),children:[]};
  for(const p of fills)if(!['SOLID','IMAGE','VIDEO'].includes(p.type))warnings.push({code:'unsupported-fill-paint',nodeId:id,type:p.type});
  if(n.strokePaints?.some(p=>p.visible!==false))warnings.push({code:'stroke-paint-unsupported',nodeId:id});
  if(n.effects?.some(e=>e.visible!==false))warnings.push({code:'effect-unsupported',nodeId:id});
  if(n.blendMode&&n.blendMode!=='NORMAL')warnings.push({code:'blend-mode-unsupported',nodeId:id,mode:n.blendMode});
  if(n.type==='TEXT'||typeof n.textData?.characters==='string'){
    const styles=new Map((n.textData?.styleOverrideTable??[]).map(x=>[x.styleID,x]));
    Object.assign(out,{text:norm(n.textData?.characters),rawText:String(n.textData?.characters??''),runs:richRuns(n),visualLines:positionedLines(n),
      fontFamily:fontFamily(n.fontName?.family),fontSize:n.fontSize??32,fontWeight:fontWeight(n.fontName?.style),
      fontStyle:/italic/i.test(n.fontName?.style??'')?'italic':'normal',color:color(fills.find(p=>p.type==='SOLID'))??'#fff',
      lineHeight:n.lineHeight??null,letterSpacing:n.letterSpacing??null,decoration:n.textDecoration??'NONE',textCase:n.textCase??'ORIGINAL',
      align:n.textAlignHorizontal??'LEFT',verticalAlign:n.textAlignVertical??'TOP',textAutoResize:n.textAutoResize??null,
      paragraphLines:(n.textData?.lines??[]).map(line=>({lineType:line.lineType??'PLAIN',
        align:styles.get(line.styleId)?.textAlignHorizontal??n.textAlignHorizontal??'LEFT',
        styleId:line.styleId??0,indentationLevel:line.indentationLevel??0,
        sourceDirectionality:line.sourceDirectionality??'AUTO',listStartOffset:line.listStartOffset??0,
        isFirstLineOfList:line.isFirstLineOfList??false}))});
  }
  if(out.runs&&n.lineHeight?.units==='AUTO')warnings.push({code:'line-height-auto-browser-metrics-risk',nodeId:id});
  if(out.runs&&n.letterSpacing?.units&&!['PERCENT','PIXELS'].includes(n.letterSpacing.units))warnings.push({code:'letter-spacing-units-unsupported',nodeId:id,units:n.letterSpacing.units});
  const media=mediaFor(n,assetNames,warnings);if(media){out.mediaLayers=media;out.media=media.at(-1);out.mediaCorners=mediaCorners(n);
    out.mediaSourceEvidence={orderedPaints:n.fillPaints??[],layer:Object.fromEntries(Object.entries(n)
      .filter(([k])=>['opacity','visible','blendMode','effects','strokePaints','strokeWeight','strokeAlign'].includes(k)||/corner/i.test(k)))};}
  if(n.type==='SHAPE_WITH_TEXT')out.appearance=generatedAppearance(doc,n,warnings);
  if(n.type==='VECTOR'||n.type==='BOOLEAN_OPERATION')out.paths=vectorPaths(doc,n,warnings);
  if(n.type==='FRAME')out.clips=n.frameMaskDisabled!==true;
  if(n.type==='ROUNDED_RECTANGLE')out.cornerRadius=n.cornerRadius??n.rectangleCornerRadii??0;
  if(n.type==='INSTANCE'){
    const masterId=guid(n.symbolData?.symbolID),master=byId.get(masterId),stack=context.symbolStack??new Set();
    if(!master||stack.has(masterId))warnings.push({code:'instance-master-unresolved',nodeId:id,masterId});
    else{
      const overrides=new Map((n.symbolData?.symbolOverrides??[]).map(x=>[(x.guidPath?.guids??[]).map(guid).join('/'),x]));
      const derived=new Map((n.derivedSymbolData??[]).map(x=>[(x.guidPath?.guids??[]).map(guid).join('/'),x]));
      const nextStack=new Set([...stack,masterId]);
      out.children=(byParent.get(masterId)??[]).sort(rank).map(c=>{
        const key=guid(c.overrideKey),patched={...c,...(overrides.get(key)??{}),...(derived.get(key)??{}),guid:c.guid,parentIndex:{...c.parentIndex,guid:n.guid}};
        return stableNode(doc,patched,byParent,byId,assetNames,warnings,{syntheticId:`${id}/${nodeId(c)}`,symbolStack:nextStack});
      });
    }
  }
  if(n.type==='VECTOR'&&!out.paths?.length)warnings.push({code:'empty-vector',nodeId:id});
  if(!['TEXT','ROUNDED_RECTANGLE','VECTOR','FRAME','SHAPE_WITH_TEXT','INSTANCE','BOOLEAN_OPERATION'].includes(n.type)&&!out.media)warnings.push({code:'unknown-slide-node',nodeId:id,type:n.type});
  out.interactions=interactionList(n);
  if(n.type!=='INSTANCE'&&!(n.type==='BOOLEAN_OPERATION'&&out.paths?.length))out.children=(byParent.get(nodeId(n))??[]).sort(rank).map(c=>stableNode(doc,c,byParent,byId,assetNames,warnings,context.syntheticId?{syntheticId:`${id}/${nodeId(c)}`,symbolStack:context.symbolStack}:{}));
  return out;
}
export function buildScenes(doc,archiveEntries,{limit=null}={}){
  if(doc.header?.prelude!=='fig-deck'||doc.header?.version!==106)throw Error(`Unsupported Figma Kiwi deck version: ${doc.header?.prelude} ${doc.header?.version}`);
  const assetNames=new Set(archiveEntries.map(e=>e.name)),byId=new Map(doc.nodes.map(n=>[nodeId(n),n])),byParent=new Map();
  for(const n of doc.nodes){const p=guid(n.parentIndex?.guid);if(!p)continue;if(!byParent.has(p))byParent.set(p,[]);byParent.get(p).push(n);}
  const pathOf=n=>{const chain=[];let p=n;const seen=new Set();while(p&&!seen.has(nodeId(p))){seen.add(nodeId(p));chain.unshift(position(p));p=byId.get(guid(p.parentIndex?.guid));}return chain.join('\u0000');};
  const slides=doc.nodes.filter(n=>n.type==='SLIDE').sort((a,b)=>pathOf(a)<pathOf(b)?-1:pathOf(a)>pathOf(b)?1:0);
  const active=slides.filter(s=>!s.isSkippedSlide),chosen=limit==null?active:active.slice(0,limit),skipped=slides.filter(s=>s.isSkippedSlide),warnings=[];
  if(!active.length)throw Error('No active slides in deck');
  const build=(s,index)=>{const size=s.size??{x:1920,y:1080},note=decodeNotes(s.slideSpeakerNotes),children=(byParent.get(nodeId(s))??[]).sort(rank).map(n=>stableNode(doc,n,byParent,byId,assetNames,warnings));
    if(visiblePaints(s).some(p=>p.type!=='SOLID'))warnings.push({code:'slide-background-paint-unsupported',slideId:nodeId(s)});
    if(s.opacity!=null&&s.opacity!==1)warnings.push({code:'slide-opacity-unsupported',slideId:nodeId(s),opacity:s.opacity});
    return{index,id:nodeId(s),label:s.name??'',skipped:!!s.isSkippedSlide,pageId:(()=>{let p=s;while(p){if(p.type==='CANVAS')return nodeId(p);p=byId.get(guid(p.parentIndex?.guid));}return null;})(),parentId:guid(s.parentIndex?.guid),position:position(s),size,background:color(visiblePaints(s).find(p=>p.type==='SOLID'))??'#000',notes:note,interactions:interactionList(s),children};};
  const scenes=chosen.map((s,i)=>build(s,i+1)),skippedScenes=skipped.map((s,i)=>build(s,i+1));
  const refs=new Set();const walk=n=>{for(const m of n.mediaLayers??(n.media?[n.media]:[])){if(m.member)refs.add(m.member);if(m.posterMember)refs.add(m.posterMember);}n.children.forEach(walk);};for(const s of [...scenes,...skippedScenes])s.children.forEach(walk);
  const first=scenes[0].size;if(scenes.some(s=>s.size.x!==first.x||s.size.y!==first.y))warnings.push({code:'mixed-slide-sizes'});
  const families=new Set();const fonts=n=>{for(const r of n.runs??[])families.add(r.fontFamily);n.children.forEach(fonts);};for(const s of [...scenes,...skippedScenes])s.children.forEach(fonts);
  if(families.size)warnings.push({code:'font-metrics-unverified',families:[...families].sort()});
  const bundledFonts=new Set(['Inter','Inter Tight','Nanum Myeongjo']);
  for(const family of [...families].sort())if(!bundledFonts.has(family))warnings.push({code:'missing-font',family,reason:'not-bundled-in-generated-project'});
  return{scenes,skippedScenes,activeCount:active.length,allSlideCount:slides.length,canvas:first,refs,warnings};
}
