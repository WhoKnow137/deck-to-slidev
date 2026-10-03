import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),studio=path.resolve(root,'../studio-fork-public'),template=path.join(root,'template');
const hash=(bytes,algorithm='sha256')=>createHash(algorithm).update(bytes).digest('hex');
const version=JSON.parse(fs.readFileSync(path.join(studio,'package.json'))).version,tar=`slidev-addon-studio-${version}.tgz`,bytes=fs.readFileSync(path.join(template,'vendor',tar));
for(const name of ['package.json','package-lock.json']){
  const file=path.join(template,name),v=JSON.parse(fs.readFileSync(file));
  if(name==='package.json')v.devDependencies['slidev-addon-studio']=`file:vendor/${tar}`;
  else {v.packages[''].devDependencies['slidev-addon-studio']=`file:vendor/${tar}`;const a=v.packages['node_modules/slidev-addon-studio'];a.version=version;a.resolved=`file:vendor/${tar}`;a.integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');}
  fs.writeFileSync(file,JSON.stringify(v,null,2)+'\n');
}
const sourceFiles=[];for(const dir of ['client','node','shared','components','setup','types','styles']){
  const walk=d=>{for(const entry of fs.readdirSync(path.join(studio,d),{withFileTypes:true})){const name=path.join(d,entry.name);if(entry.isDirectory())walk(name);else sourceFiles.push(name.replaceAll('\\','/'));}};walk(dir);
}
for(const file of ['package.json','index.d.ts','vite.config.ts','global-top.vue','custom-nav-controls.vue'])sourceFiles.push(file);
const snapshot=createHash('sha256');for(const file of sourceFiles.sort()){snapshot.update(file+'\0');snapshot.update(fs.readFileSync(path.join(studio,file)));snapshot.update('\0');}
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:studio,encoding:'utf8'});if(git.status!==0)throw Error('Studio Git base unavailable');
const status=spawnSync('git',['status','--porcelain','--untracked-files=all'],{cwd:studio,encoding:'utf8'});if(status.status!==0)throw Error('Studio Git status unavailable');
const file=path.join(template,'studio-contract.json'),m=JSON.parse(fs.readFileSync(file));Object.assign(m,{converterVersion:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,studioPackageVersion:version,studioCommit:git.stdout.trim(),studioWorkingTree:!!status.stdout.trim(),studioSourceSnapshotSha256:snapshot.digest('hex'),studioTarballSha256:hash(bytes),layerContractSourceSha256:hash(fs.readFileSync(path.join(studio,'shared/managed-layer.ts'))),layerContractBundleSha256:hash(fs.readFileSync(path.join(root,'lib/layer-contract.mjs'))),structuralTransactionSourceSha256:hash(fs.readFileSync(path.join(studio,'node/structural-transaction.ts'))),structuralTransactionBundleSha256:hash(fs.readFileSync(path.join(root,'lib/structural-transaction.mjs')))});
Object.assign(m,{imagePaintInspectionOnly:true,imagePaintContractSourceSha256:hash(fs.readFileSync(path.join(studio,'shared/image-paint.ts'))),imagePaintContractBundleSha256:hash(fs.readFileSync(path.join(root,'lib/image-paint-contract.mjs')))});
fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');console.log(JSON.stringify(m,null,2));
