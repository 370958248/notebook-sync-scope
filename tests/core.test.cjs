'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../plugin/core.js'),IO=require('../plugin/io.js');
const A='20000101000000-firstbk',B='20000101000001-secondb';
const D='20000101000002-foldera',E='20000101000003-nesteda',F='20000101000004-folderb';
test('document scope includes its file and descendant directory but no sibling or ancestor',()=>{
 const key=A+'/'+D+'/'+E,text=C.render('assets/manual.pdf\n',[key]);assert.deepEqual(C.parse(text).ids,[key]);
 assert.ok(text.includes('/'+key+'/\n/'+key+'.sy'));assert.ok(!text.includes('/'+A+'/\n'));assert.equal(C.render(text,[]),'assets/manual.pdf\n');
 assert.equal(C.contains(A+'/'+D,key),true);assert.equal(C.contains(A+'/'+D,A+'/'+F),false);
});
test('deduplicates overlapping notebook and nested document exclusions',()=>{
 assert.deepEqual(C.scopes([A+'/'+D+'/'+E,A+'/'+D,B+'/'+F,A+'/'+D]),[A+'/'+D,B+'/'+F]);
 assert.deepEqual(C.scopes([A+'/'+D,A,A+'/'+D+'/'+E]),[A]);
});
test('whole notebook to one folder migration preserves manual rules and describes both changes',()=>{
 const before=C.render('!assets/keep.pdf\r\n',[A]),plan=C.preview(before,[A+'/'+D]);
 assert.deepEqual(plan.added,[A+'/'+D]);assert.deepEqual(plan.removed,[A]);assert.ok(plan.after.startsWith('!assets/keep.pdf\r\n'));
 assert.deepEqual(C.parse(plan.after).ids,[A+'/'+D]);assert.equal(C.preview(before,[A]).after,before);
});
test('rejects unsafe document scopes and partially paired nested rules',()=>{
 for(const key of [A+'//'+D,A+'/../'+D,A+'/assets',A+'/'+D+'.sy',A+'/'+D+'\n/assets/',A+'/'+D+'/',A+'\\'+D])assert.throws(()=>C.render('',[key]));
 assert.throws(()=>C.parse(C.BEGIN+'\n/'+A+'/'+D+'/\n'+C.END));
 assert.throws(()=>C.fromPath(A,'/'+D+'/../'+E+'.sy'));assert.equal(C.fromPath(A,'/'+D+'/'+E+'.sy'),A+'/'+D+'/'+E);
});
test('folder backups can be read and restored alongside legacy notebook backups',async()=>{
 const record={version:1,at:'now',before:C.render('',[A]),after:C.render('',[A+'/'+D])};
 const io=IO.create(async()=>new Response(JSON.stringify([record]),{headers:{'content-type':'text/plain'}}));assert.deepEqual(await io.history(),[record]);
});
test('directory adapter asks for all direct children including hidden documents and validates ancestry',async()=>{
 const calls=[];let files=[{id:D,path:'/'+D+'.sy',name:'资料目录.sy',subFileCount:2}];
 const io=IO.create(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({code:0,data:{files}});});
 const result=await io.children(A);assert.equal(result[0].key,A+'/'+D);assert.equal(result[0].name,'资料目录');assert.equal(result[0].childCount,2);
 assert.equal(calls[0].body.maxListCount,0);assert.equal(calls[0].body.showHidden,true);assert.equal(calls[0].body.path,'/');
 files=[{id:E,path:'/'+D+'/'+E+'.sy',name:'下级'}];await io.children(A+'/'+D);assert.equal(calls[1].body.path,'/'+D+'.sy');
 await assert.rejects(io.children(A),/路径不一致/);await assert.rejects(io.children(A+'/../assets'),/路径无效/);
});
test('new folder selection checks current document location before backup and writing',async()=>{
 let data='',calls=[];const manager=new C.Manager({read:async()=>data,validateScopes:async keys=>{assert.deepEqual(keys,[A+'/'+D]);calls.push('validate');},backup:async()=>calls.push('backup'),write:async text=>{data=text;calls.push('write');}});
 await manager.apply(C.preview('',[A+'/'+D]));assert.deepEqual(calls,['validate','backup','write']);
});
test('moved documents stop application before backup; paths are resolved without reading bodies',async()=>{
 const calls=[];let moved=true;const adapter=IO.create(async(url,options)=>{calls.push(url);return Response.json({code:0,data:{notebook:A,path:'/'+(moved?F:D)+'.sy'}});});
 await assert.rejects(adapter.validateScopes([A+'/'+D]),/位置已变化/);assert.deepEqual(calls,['/api/filetree/getPathByID']);moved=false;await adapter.validateScopes([A+'/'+D]);
 let writes=0,backups=0;const manager=new C.Manager({read:async()=>'',validateScopes:async()=>{throw Error('moved');},backup:async()=>backups++,write:async()=>writes++});
 await assert.rejects(manager.apply(C.preview('',[A+'/'+D])),/moved/);assert.equal(backups,0);assert.equal(writes,0);
});
test('rejects an oversized generated rule before backup or write',()=>{assert.throws(()=>C.preview('x'.repeat(C.MAX-1)+'\n',[A]),/规则过大/);});
test('bundled plugin runs with only the official SiYuan require, including browser hosts',async()=>{const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');class Plugin{addCommand(){}addIcons(){}}const ctx={module:{exports:{}},require:key=>{assert.equal(key,'siyuan');return {Plugin,Dialog:class{}};},fetch(){}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../index.js'),'utf8'),ctx);const instance=new ctx.module.exports();await instance.onload();assert.ok(instance.io);});
test('excludes a whole notebook and its root descriptor, never shared assets',()=>{const text=C.render('',[A]);assert.deepEqual(C.parse(text).ids,[A]);assert.ok(text.includes('/'+A+'/\n/'+A+'.sy'));assert.ok(!text.includes('assets'));});
test('preserves manual rules and their order including negations',()=>{const manual='\uFEFFassets/*.pdf\r\n!assets/keep.pdf\r\n# user comment\r\n';const text=C.render(manual,[B,A,A]);assert.ok(text.startsWith(manual));assert.deepEqual(C.parse(text).ids,[A,B]);assert.equal(C.render(text,[]),manual);});
test('replaces only the owned block, keeping later manual rules before the managed block',()=>{const before=C.render('manual\n',[A])+'!unrelated\n';const after=C.render(before,[B]);assert.ok(after.startsWith('manual\n!unrelated\n'));assert.deepEqual(C.parse(after).ids,[B]);assert.equal((after.match(/BEGIN/g)||[]).length,1);});
test('rejects malformed markers, unknown rules, partial exclusions, injected paths',()=>{for(const text of [C.BEGIN,C.END,C.render('',[A])+C.END,C.BEGIN+'\n/assets/\n'+C.END,C.BEGIN+'\n/'+A+'/\n'+C.END])assert.throws(()=>C.parse(text));for(const value of [['../assets'],[A+'\n/assets/'],['assets'],{}])assert.throws(()=>C.render('',value));});
test('opening, previews, cancellation and no-op saves do not write',async()=>{const calls=[];const manager=new C.Manager({read:async()=>'',backup:async()=>calls.push('backup'),write:async()=>calls.push('write')});await manager.load();C.preview('',[A]);assert.deepEqual(calls,[]);assert.deepEqual(await manager.apply(C.preview('',[])),{changed:false});assert.deepEqual(calls,[]);});
test('backs up before a write and verifies the persisted result',async()=>{let data='manual\n';const calls=[];const manager=new C.Manager({read:async()=>data,backup:async x=>{calls.push('backup');assert.equal(x.before,data);},write:async x=>{calls.push('write');data=x;}});assert.deepEqual(await manager.apply(C.preview(data,[A])),{changed:true});assert.deepEqual(calls,['backup','write']);assert.deepEqual(C.parse(data).ids,[A]);});
test('backup failure prevents the rule write',async()=>{let writes=0;const manager=new C.Manager({read:async()=>'',backup:async()=>{throw Error('backup failed');},write:async()=>writes++});await assert.rejects(manager.apply(C.preview('',[A])),/backup failed/);assert.equal(writes,0);});
test('detects external edits before and during backup, preserving other writers',async()=>{for(const during of [false,true]){let data=during?'':'external',writes=0;const manager=new C.Manager({read:async()=>data,backup:async()=>{data='external';},write:async()=>writes++});await assert.rejects(manager.apply(C.preview('',[A])),/发生变化|其他窗口/);assert.equal(writes,0);assert.equal(data,'external');}});
test('rejects tampered previews, partial writes, and concurrent saves',async()=>{let release;const wait=new Promise(r=>release=r),plan=C.preview('',[A]);const manager=new C.Manager({read:async()=>'',backup:()=>wait,write:async()=>{}});await assert.rejects(manager.apply({...plan,after:'tampered'}),/失效/);const first=manager.apply(plan);await new Promise(r=>setImmediate(r));await assert.rejects(manager.apply(plan),/正在保存/);release();await assert.rejects(first,/回读|核对/);});
test('restore range preserves newly added manual rules',()=>{const previous='assets/private.zip\n',current=C.render(previous,[A])+'assets/new-file.zip\n';const restored=C.render(current,C.parse(previous).ids);assert.ok(restored.includes('assets/private.zip'));assert.ok(restored.includes('assets/new-file.zip'));assert.deepEqual(C.parse(restored).ids,[]);});
test('file adapter treats permission errors as errors, not an empty rule file',async()=>{const io=IO.create(async()=>new Response(JSON.stringify({code:403,msg:'denied'}),{status:403,headers:{'content-type':'application/json'}}));await assert.rejects(io.read(),/403/);});
test('adapter writes only the two fixed paths; storage backup must read back exactly',async()=>{const writes=[];const io=IO.create(async(url,options)=>{if(url.endsWith('getFile'))return new Response('',{status:404});const dest=options.body.get('path');writes.push(dest);return Response.json({code:0,data:null});});await assert.rejects(io.backup({version:1,at:'now',before:'',after:C.render('',[A])}),/核对/);assert.deepEqual(writes,[IO.BACKUP]);assert.ok(!writes.includes(IO.RULE));});
