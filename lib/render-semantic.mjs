import {formatNotes} from './scene.mjs';
import {renderSlidesMd,renderLayout as legacyLayout} from './render.mjs';
import {analyzeStudioText} from './studio-text.mjs';
import {mediaProjection} from './appearance.mjs';
import {analyzeLayer,layerContext} from './managed-layer.mjs';
import {imagePaintEvidence} from './image-paint-evidence.mjs';
import {canonicalJson} from './studio-text.mjs';
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
  if(m.mode==='STRETCH'&&mediaProjection(m).supported)return mediaProjection(m).style;
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
export function renderUnsupportedText(n){
  return `<div class="figma-text figma-text-fallback" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n)+`white-space:pre-wrap;${n.verticalAlign==='BOTTOM'?'display:flex;align-items:flex-end;':n.verticalAlign==='CENTER'?'display:flex;align-items:center;':''}`)}">${fallbackText(n)}</div>`;
}
function renderText(n,warnings,depth){
  const capability=analyzeStudioText(n,{nested:depth>0});
  if(capability.supported){
    if(capability.readOnlyTransform)warnings.push({code:'read-only-transform',nodeId:n.id});
    if(capability.modeFallback)warnings.push({code:'resize-mode-fallback-fixed',nodeId:n.id});
    return capability.source;
  }
  warnings.push({code:'unsupported-text',nodeId:n.id,reason:capability.reason});
  if(n.verticalAlign!=='TOP')warnings.push({code:'fallback-vertical-align-approximate',nodeId:n.id,align:n.verticalAlign});
  return renderUnsupportedText(n);
}
function renderMedia(n,assets,warnings){
  const m=n.media,asset=m?.member?assets.get(m.member):null;
  if(!asset){warnings.push({code:'unavailable-media',nodeId:n.id,member:m?.member??null,hash:m?.hash??null});return `<DeckShape class="figma-media figma-media-missing" data-figma-node-id="${attr(n.id)}" style="${attr(box(n))}" fill="#442222" />`;}
  const p=paint(m,warnings,n.id);if(m.opacity!==1)p.opacity=num(m.opacity);
  const radius=n.mediaCorners?n.mediaCorners.uniformRadius:(Number.isFinite(n.cornerRadius)&&n.cornerRadius>=0?n.cornerRadius:null);
  const clipping=radius==null?'':`border-radius:${num(radius)}px;overflow:hidden;`;
  const common=`class="figma-media figma-${m.kind}" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n)+clipping)}"`;
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
function renderGeneratedShape(n){
  const rgb=c=>`rgb(${c.r*255},${c.g*255},${c.b*255})`;
  const parts=n.appearance.parts.filter(p=>p.rendering.supported).map((p,pi)=>{
    const definitions=[],paths=[];
    for(const [fi,f] of p.fills.entries()){
      if(f.visible===false||!f.rendering.supported)continue;
      let fill,alpha;
      if(f.type==='SOLID'){fill=rgb(f.color);alpha=` fill-opacity="${f.color.a}"`;}
      else{
        // These SVG resource IDs are rendering-local, not generated edit identities.
        const id=`figma-gradient-${Buffer.from(n.id).toString('hex')}-${pi}-${fi}`,r=f.rendererProjection;
        const stops=f.stops.map(s=>`<stop offset="${s.position}" stop-color="${rgb(s.color)}" stop-opacity="${s.color.a}" />`).join('');
        definitions.push(`<linearGradient id="${id}" gradientUnits="${r.units}" x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}" gradientTransform="matrix(${r.matrix.join(' ')})">${stops}</linearGradient>`);
        fill=`url(#${id})`;alpha='';
      }
      for(const g of p.geometry)paths.push(`<path d="${attr(g.path)}" fill="${attr(fill)}"${alpha} opacity="${f.opacity??1}" fill-rule="${g.windingRule==='ODD'?'evenodd':'nonzero'}" />`);
    }
    const t=p.transform;
    return `<g transform="matrix(${[t.m00,t.m10,t.m01,t.m11,t.m02,t.m12].join(' ')})" opacity="${p.opacity??1}">${definitions.length?`<defs>${definitions.join('')}</defs>`:''}${paths.join('')}</g>`;
  }).join('');
  // A raw HTML block keeps Markdown from wrapping a bare SVG in a paragraph.
  // The wrapper owns exactly the source layer's frame and stacking position.
  return `<div class="figma-shape figma-generated-shape" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" data-appearance-scope="INTERPRETED-OBSERVED" style="${attr(box(n)+'overflow:visible;')}"><svg style="display:block;width:100%;height:100%;overflow:visible" viewBox="0 0 ${num(n.size.x)} ${num(n.size.y)}" aria-hidden="true">${parts}</svg></div>`;
}
function renderNode(n,assets,warnings,depth=0,context=null,skipManaged=false){
  const capability=context&&!skipManaged?analyzeLayer(n,context.slideId,{nested:depth>0,duplicate:context.counts.get(n.id)!==1}):null;
  if(capability?.managed&&depth===0){
    const a=capability,g=a.geometry;
    const local={...n,transform:{...n.transform,m02:0,m12:0,...(!a.affine?{m00:1,m01:0,m10:0,m11:1}:{})}};
    let body=renderNode(local,assets,warnings,depth,null,true).trim();
    // Only the owning rendered frame follows wrapper W/H; media paint, SVG viewBox,
    // paths and child local geometry stay byte-for-byte source projections.
    body=body.replace(`width:${num(n.size.x)}px;height:${num(n.size.y)}px;`,'width:100%;height:100%;');
    const metadata={version:'1',id:a.id,'slide-id':a.slideId,'source-id':a.source.figmaGuid,'source-type':a.source.kiwiType,
      'instance-path':a.source.instancePath.join('/'),kind:a.kind,pos:[g.x,g.y,g.width,g.height].join(','),rotate:String(g.rotationDeg),
      capability:a.capabilities.level,reason:a.capabilities.reason,rotation:String(a.capabilities.rotation)};
    const evidence=imagePaintEvidence(n,assets);if(evidence)metadata['paint-evidence']=canonicalJson(evidence);
    const attrs=Object.entries(metadata).map(([k,v])=>`${k}="${attr(v)}"`).join(' ');
    return `<StudioLayer ${attrs}>\n${body}\n</StudioLayer>`;
  }
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
  if(kind==='text')body=renderText(n,warnings,depth);
  else if(['image','gif','video'].includes(kind))body=renderMedia(n,assets,warnings);
  else if(kind==='vector')body=renderVector(n);
  else if(kind==='shape')body=n.appearance?renderGeneratedShape(n):`<DeckShape class="figma-shape" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n))}" fill="${attr(n.fill??'transparent')}" :radius="${num(n.cornerRadius??0)}" />`;
  else if(kind==='container'){
    const children=n.children.map(c=>renderNode(c,assets,warnings,depth+1)).join('\n');
    body=`<DeckGroup class="figma-container" data-figma-node-id="${attr(n.id)}" data-figma-name="${attr(n.name)}" style="${attr(box(n))}"${n.clips?' clip':''}${n.fill?` fill="${attr(n.fill)}"`:''}>\n${children}\n${pad}</DeckGroup>`;
  }else{warnings.push({code:'unsupported-node-rendered-as-box',nodeId:n.id,type:n.type});body=`<DeckShape class="figma-unsupported" data-figma-node-id="${attr(n.id)}" style="${attr(box(n))}" fill="${attr(n.fill??'transparent')}" />`;}
  if(depth===0&&capability&&!capability.managed)body=body.replace(/^(\s*<[\w-]+)/,`$1 data-studio-render-only="${attr(capability.reason)}"`);
  return pad+body;
}
export function renderPage(scene,assets,warnings,target=null){
  const head=`---\nlayout: figma\nfigmaSlideId: ${JSON.stringify(scene.id)}\nfigmaBackground: ${JSON.stringify(scene.background)}\nfigmaNavTarget: ${target??'null'}\n---\n\n`;
  const context=layerContext(scene);
  const html=scene.children.map(n=>renderNode(n,assets,warnings,0,context).trim()).join('\n\n');
  const notes=scene.notes.status==='present'?`\n\n<!--\n${formatNotes(scene.notes)}\n-->`:'';
  return head+html+'\n\n<!-- figma-managed-insert -->'+notes+'\n';
}
export function renderLayout(canvas){
  return legacyLayout(canvas).replace("@import '@fontsource/inter-tight/100.css';","@import '@fontsource/inter/400.css';\n@import '@fontsource/inter-tight/100.css';\n@import '@fontsource/inter-tight/500.css';")
    .replace('html.slidev-studio-docked .figma-stage > .figma-text *,html.slidev-studio-docked .figma-stage > .figma-media * {pointer-events:none;}','')
    .replace('html.slidev-studio-docked .figma-stage > .figma-text[contenteditable="true"] * {pointer-events:auto;}','')
    .replace('.figma-text,.figma-media,.figma-node {box-sizing:border-box;}','.figma-text,.figma-media,.figma-container,.figma-shape,.figma-vector {box-sizing:border-box;}');
}
