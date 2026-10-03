/** Reshape pages made by the original converter without changing their text or media. */
export function migrateLegacyPage(source){
  const match=source.match(/^([\s\S]*?\n---\r?\n\r?\n)<SlideNavigation(?: target="([^"]+)")?>\r?\n<div class="figma-stage" data-figma-slide-id="([^"]+)" style="background:([^"]+)">\r?\n([\s\S]*?)\r?\n<\/div>\r?\n<\/SlideNavigation>([\s\S]*)$/);
  if(!match){if(source.includes('<SlideNavigation')||source.includes('figma-stage'))throw Error('Unrecognized legacy slide markup');return null;}
  const [,head,target,slideId,background,body,tail]=match;
  const markers=[...body.matchAll(/^  <!-- ([A-Z_]+): ([^\r\n]*?) -->\r?$/gm)];
  if(!markers.length||body.slice(0,markers[0].index).trim())throw Error(`Cannot identify top-level objects on slide ${slideId}`);
  const objects=markers.map((marker,i)=>{
    const chunk=body.slice(marker.index,i+1<markers.length?markers[i+1].index:body.length);
    const firstBreak=chunk.indexOf('\n');
    if(firstBreak<0)throw Error(`Incomplete object on slide ${slideId}`);
    let html=chunk.slice(firstBreak+1).trim();
    if(!/^<div class="figma-(?:text|media|node)"/.test(html))throw Error(`Unexpected object markup on slide ${slideId}`);
    html=html.replace(/^<div class="figma-(?:text|media|node)"/,opening=>`${opening} data-figma-name="${marker[2]}"`);
    html=html.replace(/(<div class="figma-text"[^>]*?style=")([^"]*)("><div class="figma-text-content" style=")([^"]*)(">)([\s\S]*?)<\/div><\/div>/g,(_full,opening,outer,_between,inner,_close,contents)=>`${opening}${outer}${inner.replaceAll('height:100%;','')}">${contents}</div>`);
    return html;
  });
  const frontmatter=head.replace(/\r?\n---\r?\n\r?\n$/,`\nfigmaBackground: ${JSON.stringify(background)}\nfigmaNavTarget: ${target??'null'}\n---\n\n`);
  if(frontmatter===head)throw Error(`Cannot update frontmatter on slide ${slideId}`);
  const result=frontmatter+objects.join('\n\n')+tail;
  const count=s=>(s.match(/data-figma-node-id=/g)??[]).length;
  if(count(source)!==count(result))throw Error(`Object count changed on slide ${slideId}`);
  return result;
}

/** Make a migrated layout keep Studio's inline editor inside the selected object. */
export function addStudioTextGuard(source){
  if(source.includes('<span class="figma-studio-guard"'))return null;
  const before='@click="navigate"><slot />';
  if(!source.includes(before))throw Error('Unrecognized Figma layout markup');
  return source.replace(before,'@click="navigate"><span class="figma-studio-guard" aria-hidden="true" style="display:none"></span><slot />');
}
