// Classification is deliberately independent of the Slidev renderer. The Kiwi
// node type and the verified archive MIME remain available as source evidence.
const imageMimes=new Set(['image/png','image/jpeg','image/webp','image/avif']);
const videoMimes=new Set(['video/mp4','video/quicktime','video/webm']);

export function classifyScenes(scenes,assets,archive,warnings){
  const records=[],byMember=new Map(archive.map(a=>[a.name,a]));
  const visit=(node,slideId,siblingOrder)=>{
    const layers=node.mediaLayers??(node.media?[node.media]:[]);
    const media=node.media;
    const asset=media?.member?byMember.get(media.member):null;
    let kind,rule;
    if(node.runs){kind='text';rule='kiwi:textData';}
    else if(media){
      kind=media.kind;
      rule=`kiwi:${kind==='video'?'VIDEO':'IMAGE'}_paint+archive:${asset?.mime??'missing'}`;
      if(!asset||!assets.has(media.member))warnings.push({code:'unresolved-media-payload',nodeId:node.id,member:media.member,hash:media.hash});
      else if((kind==='video'&&!videoMimes.has(asset.mime))||(kind==='gif'&&asset.mime!=='image/gif')||(kind==='image'&&!imageMimes.has(asset.mime))){
        warnings.push({code:'media-mime-kind-mismatch',nodeId:node.id,member:media.member,paintKind:kind,mime:asset.mime});
        kind='unsupported';
      }
    }else if(node.paths?.length){kind='vector';rule='kiwi:resolvedVectorPaths';}
    else if(node.appearance?.parts.some(p=>p.rendering.supported&&p.fills.some(f=>f.visible!==false))){kind='shape';rule='INTERPRETED-OBSERVED:source-generated-fillGeometry+fillPaints';}
    else if(['ROUNDED_RECTANGLE','RECTANGLE','ELLIPSE','LINE','POLYGON','STAR'].includes(node.type)){kind='shape';rule=`kiwi:${node.type}`;}
    else if(['FRAME','GROUP','INSTANCE','COMPONENT','SHAPE_WITH_TEXT','BOOLEAN_OPERATION'].includes(node.type)){kind='container';rule=`kiwi:${node.type}`;}
    else{kind='unsupported';rule=`kiwi:unhandled:${node.type}`;warnings.push({code:'unclassified-node',nodeId:node.id,type:node.type});}
    node.sourceNodeType=node.type;node.presentationKind=kind;node.conversionRule=rule;
    const mediaEvidence=layers.map(m=>{const a=m.member?byMember.get(m.member):null,p=m.posterMember?byMember.get(m.posterMember):null;return{paintIndex:m.paintIndex??0,kind:m.kind,hash:m.hash??null,archiveMember:m.member??null,mime:a?.mime??null,sha1:a?.sha1??null,sha256:a?.sha256??null,bytes:a?.uncompressedSize??null,available:!!(m.member&&assets.has(m.member)),poster:m.posterMember?{archiveMember:m.posterMember,hash:m.posterHash??null,mime:p?.mime??null,sha1:p?.sha1??null,sha256:p?.sha256??null,available:assets.has(m.posterMember)}:null};});
    records.push({slideId,nodeId:node.id,parentId:node.parentId,siblingOrder,sourceNodeType:node.type,presentationKind:kind,conversionRule:rule,sourceEvidence:{kiwiFields:[node.runs?'textData':null,node.media?'fillPaints':null,node.paths?.length?'vectorPaths':null,node.appearance?'nodeGenerationData':null,node.appearance?'derivedImmutableFrameData':null,node.mediaCorners?.uniformRadius!=null?'cornerRadius':null,node.children.length?'children':null].filter(Boolean),media:mediaEvidence},box:{x:node.transform.m02,y:node.transform.m12,width:node.size.x,height:node.size.y},matrix:node.transform,opacity:node.opacity,visible:node.visible,clip:!!node.clips,warnings:warnings.filter(w=>w.nodeId===node.id).map(w=>w.code)});
    node.children.forEach((child,i)=>visit(child,slideId,i));
  };
  for(const s of scenes) s.children.forEach((node,i)=>visit(node,s.id,i));
  return{schemaVersion:1,records};
}
