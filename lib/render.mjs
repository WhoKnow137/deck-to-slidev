import {formatNotes} from './scene.mjs';

const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const attr=s=>esc(s).replaceAll('"','&quot;').replaceAll("'",'&#39;');
const num=n=>Number(Number(n??0).toFixed(6));
const font=s=>`'${String(s??'Inter Tight').replace(/[^\p{L}\p{N} _-]/gu,'')}',sans-serif`;
const matrix=m=>`matrix(${[m.m00,m.m10,m.m01,m.m11].map(num).join(',')},0,0)`;
const box=n=>`position:absolute;left:${num(n.transform.m02)}px;top:${num(n.transform.m12)}px;width:${num(n.size.x)}px;height:${num(n.size.y)}px;transform:${matrix(n.transform)};transform-origin:0 0;opacity:${num(n.opacity)};${n.visible?'':'display:none;'}`;
const textContent=s=>esc(s).replaceAll('\n','<br />');
const css=o=>Object.entries(o).map(([k,v])=>`${k.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`)}:${v}`).join(';');
function paint(media,warnings,nodeId){
  const t=media.paintTransform;
  if(media.mode==='STRETCH'&&t?.m00&&t?.m11&&!t.m01&&!t.m10)return {position:'absolute',width:`${num(100/t.m00)}%`,height:`${num(100/t.m11)}%`,left:`${num(-100*t.m02/t.m00)}%`,top:`${num(-100*t.m12/t.m11)}%`,objectFit:'fill'};
  if(media.mode==='FILL'){
    if(t&&(Math.abs(t.m00-1)>0.000001||Math.abs(t.m11-1)>0.000001||Math.abs(t.m02)>0.000001||Math.abs(t.m12)>0.000001||Math.abs(t.m01)>0.000001||Math.abs(t.m10)>0.000001))warnings.push({code:'crop-transform-approximate',nodeId,transform:t});
    return{position:'absolute',width:'100%',height:'100%',left:'0',top:'0',objectFit:'cover'};
  }
  if(media.mode==='FIT')return{position:'absolute',width:'100%',height:'100%',left:'0',top:'0',objectFit:'contain'};
  warnings.push({code:'unknown-image-scale-mode',nodeId,mode:media.mode});return{position:'absolute',width:'100%',height:'100%',left:'0',top:'0',objectFit:'fill'};
}
function textStyle(n){
  const lh=n.lineHeight?.units==='RAW'?String(num(n.lineHeight.value)):n.lineHeight?.units==='PIXELS'?`${num(n.lineHeight.value)}px`:'1.2';
  const ls=n.letterSpacing?.units==='PERCENT'?`${num(n.letterSpacing.value)}%`:n.letterSpacing?.units==='PIXELS'?`${num(n.letterSpacing.value)}px`:'0';
  return `font-family:${font(n.fontFamily)};font-size:${num(n.fontSize)}px;font-weight:${n.fontWeight};line-height:${lh};letter-spacing:${ls};text-align:${String(n.align).toLowerCase()};color:${n.fill??'#fff'};white-space:pre-wrap;overflow-wrap:normal;${n.verticalAlign==='BOTTOM'?'display:flex;align-items:flex-end;':n.verticalAlign==='CENTER'?'display:flex;align-items:center;':''}`;
}
function renderText(n){
  if(n.visualLines)return n.visualLines.map(l=>{const s=`position:absolute;left:${num(l.x)}px;top:${num(l.top)}px;white-space:nowrap;line-height:1;font-family:${font(l.fontFamily)};font-weight:${l.fontWeight};font-size:${num(l.fontSize)}px;color:${l.color};text-decoration:${l.decoration};`;return `  <span style="${attr(s)}">${esc(l.text)}</span>`;}).join('\n');
  return n.runs.map(r=>`  <span style="${attr(`font-family:${font(r.fontFamily)};font-weight:${r.fontWeight};font-size:${num(r.fontSize)}px;color:${r.color};text-decoration:${r.decoration};`)}">${textContent(r.text)}</span>`).join('\n');
}
function renderMedia(n,assets,warnings){const m=n.media,p=paint(m,warnings,n.id),src=assets.get(m.member)?.url;
  if(!src){warnings.push({code:'unavailable-media',nodeId:n.id,member:m.member});return'';}
  if(m.opacity!==1)p.opacity=num(m.opacity);
  const style=attr(css(p));
  if(m.kind==='video'){
    const poster=m.posterMember?assets.get(m.posterMember)?.url??'':'';
    return `<DeckVideo src="${attr(src)}" poster="${attr(poster)}" :media-style='${attr(JSON.stringify(p))}' :playback='${attr(JSON.stringify(m.playback??{}))}' />`;
  }
  return `<img src="${attr(src)}" alt="${attr(n.name)}" draggable="false" style="${style}" />`;
}
function renderVector(n){if(!n.paths?.length)return'';
  const paths=n.paths.map(p=>`<path d="${attr(p.d)}" ${p.kind==='stroke'?`fill="none" stroke="${attr(p.color)}"`:`fill="${attr(p.color)}" fill-rule="${p.windingRule==='ODD'?'evenodd':'nonzero'}"`} />`).join('');
  return `<svg class="figma-vector-content" viewBox="0 0 ${num(n.size.x)} ${num(n.size.y)}" width="100%" height="100%" aria-hidden="true">${paths}</svg>`;
}
function renderNode(n,assets,warnings,depth=0){
  const pad='  '.repeat(depth+1),cls=n.media?'figma-media':n.type==='TEXT'?'figma-text':'figma-node';
  const style=box(n)+(n.type==='TEXT'||n.runs?textStyle(n):'')+(n.type==='FRAME'&&n.clips?'overflow:hidden;':'')+(n.fill&&!n.media&&!['TEXT','VECTOR','BOOLEAN_OPERATION'].includes(n.type)?`background:${n.fill};`:'')+(n.type==='ROUNDED_RECTANGLE'&&Number.isFinite(n.cornerRadius)?`border-radius:${num(n.cornerRadius)}px;`:'');
  let body='';if(n.media)body+=renderMedia(n,assets,warnings);else if(n.type==='TEXT'||n.runs)body+=renderText(n);else if(n.type==='VECTOR'||n.type==='BOOLEAN_OPERATION')body+=renderVector(n);
  if(n.children.length)body+='\n'+pad+'  <br class="figma-studio-guard" style="display:none" />\n'+n.children.map(c=>renderNode(c,assets,warnings,depth+1)).join('\n')+'\n'+pad;
  return `${pad}<div class="${cls}" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(style)}">${body}</div>`;
}
export function renderPage(scene,assets,warnings,target=null){
  const head=`---\nlayout: figma\nfigmaSlideId: ${JSON.stringify(scene.id)}\nfigmaBackground: ${JSON.stringify(scene.background)}\nfigmaNavTarget: ${target??'null'}\n---\n\n`;
  const html=scene.children.map(n=>renderNode(n,assets,warnings).trim()).join('\n\n');
  const notes=scene.notes.status==='present'?`\n\n<!--\n${formatNotes(scene.notes)}\n-->`:'';
  return head+html+notes+'\n';
}
export function renderSlidesMd(scenes,canvas,title){const id=i=>String(i).padStart(3,'0');
  const meta=`---\ntitle: ${JSON.stringify(title)}\naspectRatio: ${num(canvas.x/canvas.y)}\ncanvasWidth: ${num(canvas.x)}\nfonts:\n  sans: Inter Tight\nsrc: ./pages/001.md\n---`;
  return meta+'\n\n'+scenes.slice(1).map((s,i)=>`---\nsrc: ./pages/${id(i+2)}.md\n---`).join('\n\n')+'\n';
}
export function renderLayout(canvas){return `<script setup>\nconst props=defineProps({figmaSlideId:String,figmaBackground:String,figmaNavTarget:{type:[String,Number],default:null}})\nfunction navigate(event){\n  if(!props.figmaNavTarget||event.defaultPrevented||document.documentElement.classList.contains('slidev-studio-docked'))return\n  const base=window.location.pathname.replace(/\\/?\\d+\\/?$/,'/').replace(/\\/$/,'')\n  window.location.assign(\`${'${base}'}/${'${props.figmaNavTarget}'}\`)\n}\n</script>\n<template><div class="figma-layout"><div class="figma-stage" :data-figma-slide-id="props.figmaSlideId" :style="{background:props.figmaBackground||'#000'}" @click="navigate"><span class="figma-studio-guard" aria-hidden="true"></span><slot /></div></div></template>\n<style>\n@import '@fontsource/inter-tight/100.css';\n@import '@fontsource/inter-tight/400.css';\n@import '@fontsource/inter-tight/700.css';\n@import '@fontsource/nanum-myeongjo/400.css';\n.slidev-layout.figma-layout {padding:0 !important;margin:0;width:100%;height:100%;overflow:hidden;background:#000;}\n.figma-stage {position:relative;width:${num(canvas.x)}px;height:${num(canvas.y)}px;overflow:hidden;isolation:isolate;}\n.figma-studio-guard {display:none;}\n.figma-text,.figma-media,.figma-node {box-sizing:border-box;}\n.figma-media {overflow:hidden;}\n.figma-media img,.figma-media video {display:block;max-width:none;max-height:none;margin:0;padding:0;}\nhtml.slidev-studio-docked .figma-stage > .figma-text *,html.slidev-studio-docked .figma-stage > .figma-media * {pointer-events:none;}\nhtml.slidev-studio-docked .figma-stage > .figma-text[contenteditable="true"] * {pointer-events:auto;}\n</style>\n`;}
