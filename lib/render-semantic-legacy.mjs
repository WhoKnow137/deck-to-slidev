import {formatNotes} from './scene.mjs';
import {renderSlidesMd,renderLayout as legacyLayout} from './render.mjs';
export {renderSlidesMd};

const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const attr=s=>esc(s).replaceAll('"','&quot;').replaceAll("'",'&#39;');
const num=n=>Number(Number(n??0).toFixed(6));
const props=o=>Object.entries(o).filter(([,v])=>v!=null).map(([k,v])=>typeof v==='number'?` :${k}="${num(v)}"`:` ${k}="${attr(v)}"`).join('');
const matrix=m=>`matrix(${[m.m00,m.m10,m.m01,m.m11].map(num).join(',')},0,0)`;
const box=n=>`position:absolute;left:${num(n.transform.m02)}px;top:${num(n.transform.m12)}px;width:${num(n.size.x)}px;height:${num(n.size.y)}px;transform:${matrix(n.transform)};transform-origin:0 0;opacity:${num(n.opacity)};${n.visible?'':'display:none;'}`;
const css=o=>Object.entries(o).map(([k,v])=>`${k.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`)}:${v}`).join(';');
const font=s=>`'${String(s??'Inter Tight').replace(/[^\p{L}\p{N} _-]/gu,'')}',sans-serif`;
const textContent=s=>esc(s).replaceAll('\n','<br />');
function paint(m,warnings,nodeId){
  const t=m.paintTransform;
  if(m.mode==='STRETCH'&&t?.m00&&t?.m11&&!t.m01&&!t.m10)return{position:'absolute',width:`${num(100/t.m00)}%`,height:`${num(100/t.m11)}%`,left:`${num(-100*t.m02/t.m00)}%`,top:`${num(-100*t.m12/t.m11)}%`,objectFit:'fill'};
  if(m.mode==='FILL'){
    if(t&&(Math.abs(t.m00-1)>0.000001||Math.abs(t.m11-1)>0.000001||Math.abs(t.m02)>0.000001||Math.abs(t.m12)>0.000001||Math.abs(t.m01)>0.000001||Math.abs(t.m10)>0.000001))warnings.push({code:'crop-transform-approximate',nodeId,transform:t});
    return{position:'absolute',width:'100%',height:'100%',left:'0',top:'0',objectFit:'cover'};
  }
  if(m.mode==='FIT')return{position:'absolute',width:'100%',height:'100%',left:'0',top:'0',objectFit:'contain'};
  warnings.push({code:'unknown-image-scale-mode',nodeId,mode:m.mode});return{position:'absolute',width:'100%',height:'100%',left:'0',top:'0',objectFit:'fill'};
}
function fallbackText(n){
  if(n.visualLines)return n.visualLines.map(l=>`<span style="${attr(`position:absolute;left:${num(l.x)}px;top:${num(l.top)}px;white-space:nowrap;line-height:1;font-family:${font(l.fontFamily)};font-weight:${l.fontWeight};font-style:${l.fontStyle??'normal'};font-size:${num(l.fontSize)}px;color:${l.color};text-decoration:${l.decoration};`)}">${esc(l.text)}</span>`).join('');
  return n.runs.map(r=>`<span style="${attr(`font-family:${font(r.fontFamily)};font-weight:${r.fontWeight};font-style:${r.fontStyle??'normal'};font-size:${num(r.fontSize)}px;color:${r.color};text-decoration:${r.decoration};`)}">${textContent(r.text)}</span>`).join('');
}
function renderText(n,warnings){
  if(n.visualLines||n.runs.length!==1){warnings.push({code:n.visualLines?'positioned-text-source-only':'mixed-text-typography-source-only',nodeId:n.id});
    return `<div class="figma-text figma-text-fallback" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n)+`white-space:pre-wrap;${n.verticalAlign==='BOTTOM'?'display:flex;align-items:flex-end;':n.verticalAlign==='CENTER'?'display:flex;align-items:center;':''}`)}">${fallbackText(n)}</div>`;}
  const r=n.runs[0],lineHeight=n.lineHeight?.units==='RAW'?String(num(n.lineHeight.value)):n.lineHeight?.units==='PIXELS'?`${num(n.lineHeight.value)}px`:'1.2';
  const letterSpacing=n.letterSpacing?.units==='PERCENT'?`${num(n.letterSpacing.value/100)}em`:n.letterSpacing?.units==='PIXELS'?`${num(n.letterSpacing.value)}px`:'0';
  return `<DeckText class="figma-text" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n))}"${props({'font-family':r.fontFamily,'font-size':r.fontSize,'font-weight':r.fontWeight,'font-style':r.fontStyle??'normal',color:r.color,'line-height':lineHeight,'letter-spacing':letterSpacing,align:n.align.toLowerCase(),'vertical-align':n.verticalAlign.toLowerCase(),decoration:r.decoration})}><span>${textContent(n.text)}</span></DeckText>`;
}
function renderMedia(n,assets,warnings){
  const m=n.media,asset=m?.member?assets.get(m.member):null;
  if(!asset){warnings.push({code:'unavailable-media',nodeId:n.id,member:m?.member??null,hash:m?.hash??null});return `<DeckShape class="figma-media figma-media-missing" data-figma-node-id="${attr(n.id)}" style="${attr(box(n))}" fill="#442222" />`;}
  const p=paint(m,warnings,n.id);if(m.opacity!==1)p.opacity=num(m.opacity);
  const common=`class="figma-media figma-${m.kind}" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n))}"`;
  if(m.kind==='video'){
    const poster=m.posterMember?assets.get(m.posterMember)?.url??'':'';
    return `<DeckVideo ${common} src="${attr(asset.url)}" poster="${attr(poster)}" :media-style='${attr(JSON.stringify(p))}' :playback='${attr(JSON.stringify(m.playback??{}))}' />`;
  }
  return `<DeckImage ${common} src="${attr(asset.url)}" alt="${attr(n.name)}" kind="${m.kind}" fit="${p.objectFit}" :media-style='${attr(JSON.stringify(p))}' />`;
}
function renderVector(n){
  const paths=(n.paths??[]).map(p=>`<path d="${attr(p.d)}" ${p.kind==='stroke'?`fill="none" stroke="${attr(p.color)}"`:`fill="${attr(p.color)}" fill-rule="${p.windingRule==='ODD'?'evenodd':'nonzero'}"`} />`).join('');
  return `<svg class="figma-vector" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n))}" viewBox="0 0 ${num(n.size.x)} ${num(n.size.y)}" aria-hidden="true">${paths}</svg>`;
}
function renderNode(n,assets,warnings,depth=0){
  const pad='  '.repeat(depth+1),kind=n.presentationKind;
  if(n.children.length&&kind!=='container'){
    // A media/shape/text paint can also be a parent. Keep its own appearance
    // beneath every child in the same local coordinate system.
    const local={...n,children:[],transform:{m00:1,m01:0,m02:0,m10:0,m11:1,m12:0},opacity:1,visible:true};
    const self=renderNode(local,assets,warnings,depth+1);
    const children=n.children.map(c=>renderNode(c,assets,warnings,depth+1)).join('\n');
    return `${pad}<DeckGroup class="figma-container figma-compound" data-figma-container-for="${attr(n.id)}" style="${attr(box(n))}"${n.clips?' clip':''}>\n${self}\n${children}\n${pad}</DeckGroup>`;
  }
  let body;
  if(kind==='text')body=renderText(n,warnings);
  else if(['image','gif','video'].includes(kind))body=renderMedia(n,assets,warnings);
  else if(kind==='vector')body=renderVector(n);
  else if(kind==='shape')body=`<DeckShape class="figma-shape" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n))}" fill="${attr(n.fill??'transparent')}" :radius="${num(n.cornerRadius??0)}" />`;
  else if(kind==='container'){
    const children=n.children.map(c=>renderNode(c,assets,warnings,depth+1)).join('\n');
    body=`<DeckGroup class="figma-container" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n))}"${n.clips?' clip':''}${n.fill?` fill="${attr(n.fill)}"`:''}>\n${children}\n${pad}</DeckGroup>`;
  }else{warnings.push({code:'unsupported-node-rendered-as-box',nodeId:n.id,type:n.type});body=`<DeckShape class="figma-unsupported" data-figma-node-id="${attr(n.id)}" style="${attr(box(n))}" fill="${attr(n.fill??'transparent')}" />`;}
  return pad+body;
}
export function renderPage(scene,assets,warnings,target=null){
  const head=`---\nlayout: figma\nfigmaSlideId: ${JSON.stringify(scene.id)}\nfigmaBackground: ${JSON.stringify(scene.background)}\nfigmaNavTarget: ${target??'null'}\n---\n\n`;
  const html=scene.children.map(n=>renderNode(n,assets,warnings).trim()).join('\n\n');
  const notes=scene.notes.status==='present'?`\n\n<!--\n${formatNotes(scene.notes)}\n-->`:'';
  return head+html+notes+'\n';
}
export function renderLayout(canvas){
  return legacyLayout(canvas).replace("@import '@fontsource/inter-tight/100.css';","@import '@fontsource/inter/400.css';\n@import '@fontsource/inter-tight/100.css';\n@import '@fontsource/inter-tight/500.css';")
    .replace('html.slidev-studio-docked .figma-stage > .figma-text *,html.slidev-studio-docked .figma-stage > .figma-media * {pointer-events:none;}','')
    .replace('html.slidev-studio-docked .figma-stage > .figma-text[contenteditable="true"] * {pointer-events:auto;}','')
    .replace('.figma-text,.figma-media,.figma-node {box-sizing:border-box;}','.figma-text,.figma-media,.figma-container,.figma-shape,.figma-vector {box-sizing:border-box;}');
}
