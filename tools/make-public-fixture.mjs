#!/usr/bin/env node
// Build a tiny, wholly synthetic Figma Slides archive for public CI.
// Node 24+ provides the zstd encoder used by the Kiwi message chunk.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {zstdCompressSync} from 'node:zlib';
import {assembleCanvasFig,createEmptyFigDoc,createFigZip,encodeFigParts} from 'openfig-core';

const doc=createEmptyFigDoc();
doc.header={prelude:'fig-deck',version:106};
const identity={m00:1,m01:0,m02:0,m10:0,m11:1,m12:0};
doc.message.nodeChanges.push({
  guid:{sessionID:0,localID:3},
  phase:'CREATED',
  parentIndex:{guid:{sessionID:0,localID:1},position:'a'},
  type:'SLIDE',name:'Synthetic slide',visible:true,opacity:1,
  transform:identity,size:{x:1280,y:720},
  fillPaints:[{type:'SOLID',color:{r:0.08,g:0.12,b:0.2,a:1},opacity:1,visible:true}],
});
doc.message.nodeChanges.push({
  guid:{sessionID:0,localID:4},
  phase:'CREATED',
  parentIndex:{guid:{sessionID:0,localID:3},position:'a'},
  type:'ROUNDED_RECTANGLE',name:'Synthetic shape',visible:true,opacity:1,
  transform:{...identity,m02:100,m12:100},size:{x:320,y:180},
  fillPaints:[{type:'SOLID',color:{r:0.2,g:0.65,b:0.8,a:1},opacity:1,visible:true}],
});
const parts=encodeFigParts(doc);
const canvasFig=assembleCanvasFig({...parts,messageCompressed:zstdCompressSync(parts.messageRaw)});
const output=fileURLToPath(new URL('../test/fixtures/public-minimal.deck',import.meta.url));
writeFileSync(output,createFigZip({canvasFig}));
console.log(output);
