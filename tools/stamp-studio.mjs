// Run after bundling shared/studiotext.ts and packing the public Studio fork.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const studio=path.resolve(process.argv[2]??path.join(root,'../studio-fork-public'));
const result=spawnSync('git',['-C',studio,'rev-parse','HEAD'],{encoding:'utf8'});
if(result.status!==0)throw Error('Cannot resolve Studio implementation commit');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const version=JSON.parse(fs.readFileSync(path.join(studio,'package.json'),'utf8')).version;
const metadata={converterVersion:'0.5.0',studioCommit:result.stdout.trim(),studioPackageVersion:version,
  studioTarballSha256:sha(path.join(root,'template/vendor',`slidev-addon-studio-${version}.tgz`)),
  contractSourceSha256:sha(path.join(studio,'shared/studiotext.ts')),
  contractBundleSha256:sha(path.join(root,'lib/studio-contract.mjs'))};
fs.writeFileSync(path.join(root,'template/studio-contract.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata,null,2));
