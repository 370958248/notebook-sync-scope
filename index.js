'use strict';
const hostRequire=require;
module.exports=(function(){
const factories={
"./core.js":function(module,exports,require){
(function(root,factory){if(typeof module==='object')module.exports=factory();else root.SyncScope=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BEGIN='# BEGIN notebook-sync-scope:v1',END='# END notebook-sync-scope:v1',MAX=65536;
  const valid=id=>typeof id==='string'&&/^\d{14}-[a-z0-9]{7}$/.test(id);
  function ids(value){if(!Array.isArray(value)||value.length>1000||value.some(id=>!valid(id)))throw Error('笔记本编号无效');return [...new Set(value)].sort();}
  function parse(text){
    if(typeof text!=='string'||text.length>MAX)throw Error('同步忽略文件过大或格式无效');
    const bom=text.startsWith('\uFEFF')?'\uFEFF':'',body=text.slice(bom.length),lines=body.split(/(?<=\n)/);let offset=0,start=-1,end=-1,inside=false;const rules=[];
    for(const raw of lines){const line=raw.replace(/\r?\n$/,'');
      if(line===BEGIN){if(start!==-1||inside)throw Error('发现重复或不完整的插件规则，请先检查 syncignore');start=offset;inside=true;}
      else if(line===END){if(!inside||end!==-1)throw Error('插件规则结束标记异常');inside=false;end=offset+raw.length;}
      else if(inside&&line.trim())rules.push(line.trim());
      offset+=raw.length;
    }
    if(inside||(start>=0&&end<0))throw Error('插件规则缺少结束标记');
    const seen=new Map();
    for(const rule of rules){const match=/^\/(\d{14}-[a-z0-9]{7})(\/|\.sy)$/.exec(rule);if(!match)throw Error('插件规则块被手动改写，请先检查');const bit=match[2]==='/'?1:2;seen.set(match[1],(seen.get(match[1])||0)|bit);}
    if([...seen.values()].some(v=>v!==3))throw Error('插件规则不完整，停止写入');
    return {ids:[...seen.keys()].sort(),outside:bom+(start<0?body:body.slice(0,start)+body.slice(end))};
  }
  function render(text,value){const selected=ids(value),p=parse(text);if(!selected.length)return p.outside;const sep=p.outside&&!p.outside.endsWith('\n')?'\n':'';const result=p.outside+sep+BEGIN+'\n'+selected.map(id=>'/'+id+'/\n/'+id+'.sy').join('\n')+'\n'+END+'\n';if(result.length>MAX)throw Error('生成的规则过大，请缩小范围或先整理手工规则');return result;}
  function preview(before,selected){const p=parse(before),target=ids(selected);return {before,after:render(before,target),ids:target,added:target.filter(id=>!p.ids.includes(id)),removed:p.ids.filter(id=>!target.includes(id))};}
  class Manager{
    constructor(io){this.io=io;this.busy=false;}
    async load(){const before=await this.io.read();return {before,ids:parse(before).ids};}
    async apply(plan){
      if(this.busy)throw Error('正在保存，请稍候');this.busy=true;
      try{
        if(!plan||preview(plan.before,plan.ids).after!==plan.after)throw Error('预览已失效，请重新预览');
        if(await this.io.read()!==plan.before)throw Error('同步规则已被其他窗口修改，请刷新后重试');
        if(plan.before===plan.after)return {changed:false};
        await this.io.backup({version:1,at:new Date().toISOString(),before:plan.before,after:plan.after});
        if(await this.io.read()!==plan.before)throw Error('备份期间规则发生变化，已停止应用，请刷新');
        await this.io.write(plan.after);
        if(await this.io.read()!==plan.after)throw Error('写入结果未通过核对，请刷新检查；原规则备份已保留');
        return {changed:true};
      }finally{this.busy=false;}
    }
  }
  return {BEGIN,END,MAX,valid,ids,parse,render,preview,Manager};
});

},
"./io.js":function(module,exports,require){
(function(root,factory){if(typeof module==='object')module.exports=factory(require('./core.js'));else root.SyncScopeIO=factory(root.SyncScope);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const RULE='/data/.siyuan/syncignore',BACKUP='/data/storage/petal/notebook-sync-scope/rule-backups.json';
  function create(fetcher){
    async function json(url,body){const res=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok||data.code!==0)throw Error(data.msg||'思源接口请求失败');return data.data;}
    async function readText(path){
      const res=await fetcher('/api/file/getFile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})});
      if(res.status===404)return '';
      const text=await res.text();
      if(!res.ok)throw Error('读取规则失败（'+res.status+'）');
      if((res.headers.get('content-type')||'').includes('application/json')){let obj;try{obj=JSON.parse(text);}catch{}if(obj&&typeof obj.code==='number'){if(obj.code===404)return '';if(obj.code!==0)throw Error(obj.msg||'读取失败');}}
      return text;
    }
    async function writeText(path,text){
      if(path!==RULE&&path!==BACKUP)throw Error('拒绝写入插件管理范围以外的文件');
      const body=new FormData();body.append('path',path);body.append('isDir','false');body.append('file',new Blob([text],{type:'text/plain;charset=utf-8'}),path===RULE?'syncignore':'rule-backups.json');
      const res=await fetcher('/api/file/putFile',{method:'POST',body});const result=await res.json();if(!res.ok||result.code!==0)throw Error(result.msg||'保存失败');
    }
    async function history(){const raw=await readText(BACKUP);if(!raw)return [];let list;try{list=JSON.parse(raw);}catch{throw Error('规则备份文件损坏，停止保存以免覆盖');}if(!Array.isArray(list)||list.length>20)throw Error('规则备份格式无效');for(const x of list){if(x.version!==1||typeof x.at!=='string'||typeof x.before!=='string'||typeof x.after!=='string')throw Error('规则备份格式无效');C.parse(x.before);C.parse(x.after);}return list;}
    async function backup(entry){const list=[entry,...await history()].slice(0,20),text=JSON.stringify(list,null,2);await writeText(BACKUP,text);if(await readText(BACKUP)!==text)throw Error('规则备份未通过核对，未修改同步范围');}
    return {read:()=>readText(RULE),write:text=>writeText(RULE,text),backup,history,notebooks:()=>json('/api/notebook/lsNotebooks',{}).then(x=>(x.notebooks||[]).filter(n=>C.valid(n.id)).map(n=>({id:n.id,name:String(n.name||n.id),closed:!!n.closed}))),info:()=>json('/api/sync/getSyncInfo',{})};
  }
  return {RULE,BACKUP,create};
});

},
"./ui.js":function(module,exports,require){
(function(root,factory){if(typeof module==='object')module.exports=factory(require('./core.js'));else root.SyncScopeUI=factory(root.SyncScope);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function mount(root,io){
    root.innerHTML='<div class="scope-intro"><strong>选择要排除后续同步的笔记本</strong><p>勾选后，笔记本目录将从本设备后续同步和数据快照中排除，本地原文保留。</p></div><div class="scope-notice">这不会立即清除已上传的云端数据或历史快照。公共附件不自动排除；其他设备也需设置相同范围。请另备份仅存本地的资料。</div><div class="scope-tools"><input data-search type="search" placeholder="搜索笔记本" aria-label="搜索笔记本"><button data-refresh>刷新规则</button></div><p class="scope-hint">下表仅表示本插件管理的排除项；已有手工规则原样保留，取消勾选不会移除手工规则。</p><div data-list class="scope-list"></div><p data-status role="status" class="scope-status"></p><section data-preview hidden><h3>修改预览</h3><p data-summary></p><pre data-rules></pre><label class="scope-consent"><input data-consent type="checkbox">我了解：这些资料不再进入本设备后续同步及数据快照；旧云端数据需单独处理。</label><div class="scope-actions"><button data-cancel>取消预览</button><button data-apply class="scope-primary" disabled>应用排除范围</button></div></section><div class="scope-actions" data-actions><button data-undo>载入上次排除范围</button><button data-export>导出规则备份</button><button data-plan class="scope-primary">预览修改</button></div>';
    const $=q=>root.querySelector(q),manager=new C.Manager(io);let books=[],baseline='',selected=new Set(),plan=null,dead=false,busy=false;
    function status(msg,error=false){$('[data-status]').textContent=msg;$('[data-status]').classList.toggle('scope-error',error);}
    function invalidate(){plan=null;$('[data-preview]').hidden=true;$('[data-actions]').hidden=false;$('[data-consent]').checked=false;$('[data-apply]').disabled=true;}
    function render(){const filter=$('[data-search]').value.trim().toLowerCase(),list=$('[data-list]');list.replaceChildren();const all=[...books,...[...selected].filter(id=>!books.some(b=>b.id===id)).map(id=>({id,name:'暂不可用的笔记本',closed:true}))];for(const book of all){if(filter&&!book.name.toLowerCase().includes(filter)&&!book.id.includes(filter))continue;const row=document.createElement('label');row.className='scope-row';const box=document.createElement('input');box.type='checkbox';box.checked=selected.has(book.id);box.dataset.id=book.id;box.setAttribute('aria-label','排除 '+book.name);box.disabled=busy;const title=document.createElement('span');title.textContent=book.name;const sub=document.createElement('small');sub.textContent=book.closed?'已关闭 / 暂不可用 · '+book.id:book.id;const label=document.createElement('span');label.append(title,sub);const badge=document.createElement('span');badge.className='scope-badge';badge.textContent=box.checked?'排除同步':'插件未排除';row.append(box,label,badge);box.addEventListener('change',()=>{if(box.checked)selected.add(book.id);else selected.delete(book.id);invalidate();render();});list.append(row);}if(!list.children.length){const empty=document.createElement('p');empty.textContent='没有匹配的笔记本';list.append(empty);}}
    async function load(){busy=true;invalidate();status('正在读取本设备规则…');try{const [state,data]=await Promise.all([manager.load(),io.notebooks()]);if(dead)return;baseline=state.before;selected=new Set(state.ids);books=data;status('已读取。当前由插件排除 '+selected.size+' 个笔记本。');}catch(e){status(e.message,true);}finally{busy=false;if(!dead)render();}}
    $('[data-search]').addEventListener('input',render);
    $('[data-refresh]').addEventListener('click',()=>{if(!busy)load();});
    $('[data-plan]').addEventListener('click',()=>{if(busy)return;try{plan=C.preview(baseline,[...selected]);if(plan.before===plan.after){status('范围没有变化。');return;}$('[data-summary]').textContent='新增排除 '+plan.added.length+' 本；取消插件排除 '+plan.removed.length+' 本。不会删除本地笔记，也不会清理云端历史。';$('[data-rules]').textContent=plan.ids.length?plan.ids.map(id=>'/'+id+'/\n/'+id+'.sy').join('\n'):'移除本插件管理的排除规则，保留其他规则。';$('[data-preview]').hidden=false;$('[data-actions]').hidden=true;$('[data-consent]').checked=false;$('[data-apply]').disabled=true;status('请核对下面的预览。');}catch(e){status(e.message,true);}});
    $('[data-consent]').addEventListener('change',()=>{$('[data-apply]').disabled=!$('[data-consent]').checked||busy;});
    $('[data-cancel]').addEventListener('click',invalidate);
    $('[data-apply]').addEventListener('click',async()=>{if(!plan||busy||!$('[data-consent]').checked)return;busy=true;$('[data-apply]').disabled=true;render();status('正在备份原规则并应用…');try{await manager.apply(plan);baseline=plan.after;invalidate();status('规则已保存并回读核对。尚未触发同步，旧云端数据未清理。');}catch(e){invalidate();status(e.message,true);}finally{busy=false;if(!dead)render();}});
    $('[data-undo]').addEventListener('click',async()=>{if(busy)return;busy=true;try{const list=await io.history();if(!list.length){status('暂无规则备份。');return;}selected=new Set(C.parse(list[0].before).ids);invalidate();status('已载入上次排除范围，仅修改草稿。请预览后应用。');}catch(e){status(e.message,true);}finally{busy=false;if(!dead)render();}});
    $('[data-export]').addEventListener('click',async()=>{if(busy)return;try{const current=await io.read(),blob=new Blob([JSON.stringify({format:'notebook-sync-scope-backup',version:1,at:new Date().toISOString(),rules:current},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='笔记本同步范围-规则备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);status('已导出规则备份，不包含笔记正文。');}catch(e){status(e.message,true);}});
    load();return ()=>{dead=true;};
  }
  return {mount};
});

},
"./entry.js":function(module,exports,require){
'use strict';
const {Plugin,Dialog}=require('siyuan'),IO=require('./io.js'),UI=require('./ui.js');
module.exports=class NotebookSyncScope extends Plugin{
  async onload(){this.io=IO.create((...args)=>fetch(...args));this.addIcons('<symbol id="iconNotebookSyncScope" viewBox="0 0 32 32"><path d="M8 24a7 7 0 0 1-1-14 9 9 0 0 1 17 1 6 6 0 0 1 0 13H8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 28 27 4" stroke="currentColor" stroke-width="3"/></symbol>');this.addCommand({langKey:'openSyncScope',langText:'打开指定同步范围',callback:()=>this.open()});}
  onLayoutReady(){this.addTopBar({icon:'iconNotebookSyncScope',title:'指定同步范围',position:'right',callback:()=>this.open()});}
  open(){if(this.dialog)return;this.dialog=new Dialog({title:'指定同步范围',content:'<div class="notebook-sync-scope"></div>',width:'780px',destroyCallback:()=>{this.dispose?.();this.dispose=null;this.dialog=null;}});this.dispose=UI.mount(this.dialog.element.querySelector('.notebook-sync-scope'),this.io);}
  onunload(){this.dispose?.();this.dialog?.destroy();this.dialog=null;}
};

}
};
const cache={};function load(name){if(name==="siyuan")return hostRequire(name);if(!Object.prototype.hasOwnProperty.call(factories,name))throw Error("Unsupported module");if(!cache[name]){const item={exports:{}};cache[name]=item;factories[name](item,item.exports,load);}return cache[name].exports;}return load("./entry.js");})();
