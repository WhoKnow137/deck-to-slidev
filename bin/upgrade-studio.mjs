#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {renderLayout} from '../lib/render.mjs';
import {addStudioTextGuard,migrateLegacyPage} from '../lib/studio-migrate.mjs';

const root=process.argv[2]&&path.resolve(process.argv[2]);
if(!root||!fs.existsSync(path.join(root,'conversion-report.json')))throw Error('Usage: node bin/upgrade-studio.mjs CONVERTED_OUTPUT_DIR');
const report=JSON.parse(fs.readFileSync(path.join(root,'conversion-report.json'),'utf8'));
const pagesDir=path.join(root,'pages'),layout=path.join(root,'layouts','figma.vue');
const pages=[...fs.readdirSync(pagesDir).filter(n=>n.endsWith('.md')).map(n=>path.join(pagesDir,n)),...fs.readdirSync(path.join(pagesDir,'skipped')).filter(n=>n.endsWith('.md')).map(n=>path.join(pagesDir,'skipped',n))];
const edits=[];
for(const page of pages){const source=fs.readFileSync(page,'utf8'),result=migrateLegacyPage(source);if(result!==null)edits.push({page,source,result});}
const guardedLayout=addStudioTextGuard(fs.readFileSync(layout,'utf8'));
if(!edits.length&&guardedLayout===null){console.log('Pages and layout already support Studio text editing.');process.exit(0);}
const backup=path.join(root,`.studio-migration-backup-${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(fs.existsSync(backup))throw Error(`Backup already exists: ${backup}`);
for(const edit of edits){const relative=path.relative(root,edit.page),destination=path.join(backup,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,edit.source);}
fs.mkdirSync(path.join(backup,'layouts'),{recursive:true});fs.copyFileSync(layout,path.join(backup,'layouts','figma.vue'));
for(const edit of edits)fs.writeFileSync(edit.page,edit.result);
fs.writeFileSync(layout,edits.length?renderLayout(report.canvas):guardedLayout);
console.log(`Upgraded ${edits.length} pages and the layout for Studio; original files: ${backup}`);
