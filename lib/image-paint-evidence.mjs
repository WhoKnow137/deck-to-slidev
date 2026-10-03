import {canonicalJson,subtreeFingerprint} from './studio-text.mjs';
const hex=h=>h?Buffer.from(Object.values(h)).toString('hex'):null;
export function imagePaintEvidence(n,assets){
  const source=n.mediaSourceEvidence;if(!source)return null;
  const resource=(hash,member)=>{const a=member?assets.get(member):null;return {sourceHash:hash??null,
    sha256:a?.sha256??null,url:a?.url??null,member:member??null};};
  return {version:1,scope:source.scope??'private-kiwi',sourceNodeId:n.id,orderedPaints:source.orderedPaints,
    layer:source.layer,placements:(n.mediaLayers??[n.media]).filter(Boolean).map(m=>({sourcePath:m.source?.path??null,
      resource:resource(m.hash,m.member),poster:m.posterHash?resource(m.posterHash,m.posterMember):null,
      thumbnail:m.source?.rawPaint?.imageThumbnail?.hash?resource(hex(m.source.rawPaint.imageThumbnail.hash),
        'images/'+hex(m.source.rawPaint.imageThumbnail.hash)):null,
      rendererProjection:m.rendererProjection??null}))};
}
export const imagePaintEvidenceFingerprint=value=>subtreeFingerprint(canonicalJson(value));
