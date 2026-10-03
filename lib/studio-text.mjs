import {createHash} from 'node:crypto';
import {normalizeText,parseStudioText,serializeStudioText} from './studio-contract.mjs';

const round=n=>{const value=Number(Number(n).toFixed(6));const integer=Math.round(value);return Math.abs(value-integer)<0.000002?integer:value;};
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
export const studioId=id=>/^\d+:\d+(?:\/\d+:\d+)*$/.test(id)
  ?`figma-${id.replaceAll('/','--').replaceAll(':','-')}`
  :`figma-hex-${Buffer.from(String(id),'utf8').toString('hex')}`;
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
export const canonicalJson=value=>JSON.stringify(ordered(value));
export const textFingerprint=node=>sha(canonicalJson({
  rawText:node.rawText??node.text,runs:node.runs,paragraphLines:node.paragraphLines,
  fontFamily:node.fontFamily,fontSize:node.fontSize,fontWeight:node.fontWeight,fontStyle:node.fontStyle,
  color:node.color,lineHeight:node.lineHeight,letterSpacing:node.letterSpacing,
  decoration:node.decoration,textCase:node.textCase,align:node.align,verticalAlign:node.verticalAlign,
  textAutoResize:node.textAutoResize,size:node.size,transform:node.transform,
  opacity:node.opacity,visible:node.visible,
}));
export const subtreeFingerprint=source=>sha(source);

function fail(reason){throw new Error(reason);}
function color(value){
  if(typeof value!=='string')fail('missing-color');
  if(/^#[0-9a-fA-F]{3}$/.test(value))return `#${[...value.slice(1)].map(c=>c+c).join('')}`.toLowerCase();
  if(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value))return value.toLowerCase();
  const m=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
  if(!m)fail('unsupported-color');
  const channels=m.slice(1,4).map(Number),alpha=m[4]===undefined?1:Number(m[4]);
  if(channels.some(n=>n>255)||!(alpha>=0&&alpha<=1))fail('unsupported-color');
  const hex=channels.map(n=>n.toString(16).padStart(2,'0')).join('');
  const a=Math.round(alpha*255);
  return `#${hex}${a===255?'':a.toString(16).padStart(2,'0')}`;
}
function lineHeight(value){
  if(value==null)return 'normal';
  if(value==='normal')return 'normal';
  if(typeof value==='number')return round(value);
  if(typeof value==='string')return value;
  if(value.units==='AUTO')return 'normal';
  const v=Number(value.value);
  if(!Number.isFinite(v)||v<0)fail('unsupported-line-height');
  if(value.units==='RAW')return round(v);
  if(value.units==='PIXELS')return `${round(v)}px`;
  if(value.units==='PERCENT')return `${round(v)}%`;
  fail('unsupported-line-height');
}
function letterSpacing(value){
  if(value==null)return 0;
  if(typeof value==='number')return value===0?0:`${round(value)}px`;
  if(typeof value==='string')return value;
  const v=Number(value.value);
  if(!Number.isFinite(v))fail('unsupported-letter-spacing');
  if(v===0)return 0;
  if(value.units==='PIXELS')return `${round(v)}px`;
  if(value.units==='PERCENT')return `${round(v/100)}em`;
  fail('unsupported-letter-spacing');
}
function decoration(value){
  const raw=String(value??'NONE').toUpperCase();
  const map={NONE:'none',UNDERLINE:'underline',STRIKETHROUGH:'line-through',LINE_THROUGH:'line-through',
    UNDERLINE_AND_STRIKETHROUGH:'underline line-through',UNDERLINE_AND_LINE_THROUGH:'underline line-through'};
  if(!Object.hasOwn(map,raw))fail('unsupported-decoration');
  return map[raw];
}
function textCase(value){
  const raw=String(value??'ORIGINAL').toUpperCase();
  const map={ORIGINAL:'none',NONE:'none',UPPER:'uppercase',UPPERCASE:'uppercase',LOWER:'lowercase',LOWERCASE:'lowercase',TITLE:'capitalize',TITLE_CASE:'capitalize'};
  if(!Object.hasOwn(map,raw))fail('unsupported-text-case');
  return map[raw];
}
function align(value){
  const map={LEFT:'left',CENTER:'center',RIGHT:'right',JUSTIFIED:'justify',JUSTIFY:'justify'};
  const answer=map[String(value??'LEFT').toUpperCase()];
  if(!answer)fail('unsupported-paragraph-style');
  return answer;
}
function vertical(value){
  const answer={TOP:'top',CENTER:'center',BOTTOM:'bottom'}[String(value??'TOP').toUpperCase()];
  if(!answer)fail('unsupported-vertical-alignment');
  return answer;
}
function style(source){
  const d={fontFamily:source.fontFamily,fontSize:round(source.fontSize),fontWeight:round(source.fontWeight),
    fontStyle:source.fontStyle??'normal',color:color(source.color),lineHeight:lineHeight(source.lineHeight),
    letterSpacing:letterSpacing(source.letterSpacing),decoration:decoration(source.decoration),textCase:textCase(source.textCase)};
  if(!d.fontFamily||!Number.isFinite(d.fontSize)||d.fontSize<=0||!Number.isFinite(d.fontWeight)||d.fontWeight<1||d.fontWeight>1000
    ||!['normal','italic','oblique'].includes(d.fontStyle))fail('missing-text-metadata');
  return d;
}
function geometry(node){
  const w=Number(node.size?.x),h=Number(node.size?.y),m=node.transform;
  if(!(w>0&&h>0)||!m||[m.m00,m.m01,m.m02,m.m10,m.m11,m.m12].some(n=>!Number.isFinite(n)))fail('missing-geometry');
  const resizeMap={WIDTH_AND_HEIGHT:'auto-width',HEIGHT:'auto-height',NONE:'fixed',FIXED:'fixed'};
  if(node.textAutoResize!=null&&!Object.hasOwn(resizeMap,node.textAutoResize))fail('unsupported-resize-mode');
  const mode=node.textAutoResize==null?'fixed':resizeMap[node.textAutoResize];
  const a=m.m00,b=m.m10,c=m.m01,d=m.m11;
  const x=round(m.m02+(a*w+c*h-w)/2),y=round(m.m12+(b*w+d*h-h)/2);
  const unit=Math.abs(Math.hypot(a,b)-1)<1e-4&&Math.abs(Math.hypot(c,d)-1)<1e-4
    &&Math.abs(a*c+b*d)<1e-4&&Math.abs(a*d-b*c-1)<1e-4;
  let rotationDeg=0,affine;
  if(unit){const raw=round((Math.atan2(b,a)*180/Math.PI+540)%360-180);rotationDeg=Math.abs(raw-Math.round(raw))<0.0001?Math.round(raw):raw;}
  else affine=[round(a),round(b),round(c),round(d),0,0];
  return {resizeMode:mode,geometry:{x,y,width:mode==='auto-width'?null:w,height:mode==='fixed'?h:null,rotationDeg,
    ...(affine?{affine}:{})},readOnlyTransform:!!affine,modeFallback:node.textAutoResize==null};
}
function splitParagraphs(runs){
  const paragraphs=[[]];
  for(const run of runs){
    const pieces=run.text.split('\n');
    for(let i=0;i<pieces.length;i++){
      if(i)paragraphs.push([]);
      if(pieces[i])paragraphs.at(-1).push({text:pieces[i].replaceAll('\u2028','\n'),overrides:{...run.overrides}});
    }
  }
  return paragraphs;
}
export function analyzeStudioText(node,context={}){
  try{
    if(context.nested||context.compound)fail('nested-in-non-Studio-container');
    if(!node||!Array.isArray(node.runs)||typeof(node.rawText??node.text)!=='string')fail('missing-text-metadata');
    const raw=node.rawText??node.text;
    if(/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)||node.visualLines)fail('positioned-or-control-text');
    if(node.runs.map(r=>r.text).join('')!==raw)fail('text-run-mismatch');
    if(node.opacity!==undefined&&node.opacity!==1||node.visible===false)fail('unsupported-visibility-or-opacity');
    if(node.paragraphLines?.some(line=>line.lineType!=='PLAIN'||(line.indentationLevel??0)!==0
      ||!['AUTO','LEFT_TO_RIGHT','LTR'].includes(line.sourceDirectionality??'AUTO')
      ||(line.listStartOffset??0)!==0||line.isFirstLineOfList===true))fail('unsupported-paragraph-style');
    const layerStyle=style(node),frame=geometry(node),lines=node.paragraphLines??[];
    const effective=node.runs.filter(r=>r.text).map(r=>({text:r.text,style:style({...layerStyle,...r})}));
    const keys=Object.keys(layerStyle);
    const layerUsed=effective.some(run=>keys.every(key=>run.style[key]===layerStyle[key]));
    const defaults=layerUsed?layerStyle:effective[0]?.style??layerStyle;
    const runs=effective.map(run=>({text:run.text,overrides:Object.fromEntries(Object.keys(defaults)
      .filter(key=>run.style[key]!==defaults[key]).map(key=>[key,run.style[key]]))}));
    const split=splitParagraphs(runs),lineAligns=lines.map(line=>align(line.align)),documentAlign=align(node.align);
    if(lines.length&&lineAligns.length!==split.length)fail('unsupported-paragraph-boundaries');
    const paragraphs=split.map((line,i)=>({properties:lineAligns[i]&&lineAligns[i]!==documentAlign?{align:lineAligns[i]}:{},runs:line}));
    const document=normalizeText({version:1,id:studioId(node.id),paragraphs,defaults,
      geometry:frame.geometry,resizeMode:frame.resizeMode,verticalAlign:vertical(node.verticalAlign),align:documentAlign});
    const source=serializeStudioText(document),parsed=parseStudioText(source);
    if(!parsed.ok)fail(`contract-rejected:${parsed.reason}`);
    const content=parsed.document.paragraphs.map(p=>p.runs.map(r=>r.text).join(''));
    const expected=raw.split('\n').map(part=>part.replaceAll('\u2028','\n'));
    if(content.length!==expected.length||content.some((part,i)=>part!==expected[i]))fail('text-roundtrip-mismatch');
    return {supported:true,document,source,readOnlyTransform:frame.readOnlyTransform,
      modeFallback:frame.modeFallback,sourceFingerprint:textFingerprint(node)};
  }catch(error){return {supported:false,reason:error instanceof Error?error.message:String(error)};}
}
