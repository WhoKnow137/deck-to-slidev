import {createRequire} from 'node:module';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),studio=path.resolve(root,'../studio-fork-public');
const require=createRequire(path.join(studio,'package.json'));
const dependency=createRequire(require.resolve('vite/package.json'));
await dependency('esbuild').build({entryPoints:[path.join(studio,'shared/managed-layer.ts')],bundle:true,minify:true,platform:'node',format:'esm',outfile:path.join(root,'lib/layer-contract.mjs')});
