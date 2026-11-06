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
  // A scope contains a notebook ID and optional document IDs, never titles.
  const validScope=key=>typeof key==='string'&&key.length<=8192&&key.split('/').every(valid);
  const contains=(parent,key)=>key===parent||key.startsWith(parent+'/');
  function scopes(value){
    if(!Array.isArray(value)||value.length>1000||value.some(key=>!validScope(key)))throw Error('排除目录编号或路径无效');
    const result=[];for(const key of [...new Set(value)].sort())if(!result.some(parent=>contains(parent,key)))result.push(key);return result;
  }
  function fromPath(notebook,path){
    if(!valid(notebook)||typeof path!=='string'||!/^\/(?:\d{14}-[a-z0-9]{7}\/)*\d{14}-[a-z0-9]{7}\.sy$/.test(path))throw Error('文档路径无效');
    const key=notebook+path.slice(0,-3);if(!validScope(key))throw Error('文档路径过长');return key;
  }
  const rules=key=>'/'+key+'/\n/'+key+'.sy';
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
    for(const rule of rules){const match=/^\/(.+?)(\/|\.sy)$/.exec(rule);if(!match||!validScope(match[1]))throw Error('插件规则块被手动改写，请先检查');const bit=match[2]==='/'?1:2;seen.set(match[1],(seen.get(match[1])||0)|bit);}
    if([...seen.values()].some(v=>v!==3))throw Error('插件规则不完整，停止写入');
    return {ids:[...seen.keys()].sort(),outside:bom+(start<0?body:body.slice(0,start)+body.slice(end))};
  }
  function render(text,value){const selected=scopes(value),p=parse(text);if(!selected.length)return p.outside;const sep=p.outside&&!p.outside.endsWith('\n')?'\n':'';const result=p.outside+sep+BEGIN+'\n'+selected.map(rules).join('\n')+'\n'+END+'\n';if(result.length>MAX)throw Error('生成的规则过大，请缩小范围或先整理手工规则');return result;}
  function preview(before,selected){const p=parse(before),target=scopes(selected);return {before,after:render(before,target),ids:target,added:target.filter(id=>!p.ids.includes(id)),removed:p.ids.filter(id=>!target.includes(id))};}
  class Manager{
    constructor(io){this.io=io;this.busy=false;}
    async load(){const before=await this.io.read();return {before,ids:parse(before).ids};}
    async apply(plan){
      if(this.busy)throw Error('正在保存，请稍候');this.busy=true;
      try{
        if(!plan)throw Error('预览已失效，请重新预览');
        const checked=preview(plan.before,plan.ids);if(checked.after!==plan.after)throw Error('预览已失效，请重新预览');
        if(await this.io.read()!==plan.before)throw Error('同步规则已被其他窗口修改，请刷新后重试');
        if(plan.before===plan.after)return {changed:false};
        if(this.io.validateScopes)await this.io.validateScopes(checked.added);
        await this.io.backup({version:1,at:new Date().toISOString(),before:plan.before,after:plan.after});
        if(await this.io.read()!==plan.before)throw Error('备份期间规则发生变化，已停止应用，请刷新');
        await this.io.write(plan.after);
        if(await this.io.read()!==plan.after)throw Error('写入结果未通过核对，请刷新检查；原规则备份已保留');
        return {changed:true};
      }finally{this.busy=false;}
    }
  }
  return {BEGIN,END,MAX,valid,ids,validScope,contains,scopes,fromPath,rules,parse,render,preview,Manager};
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
    async function children(key){
      if(!C.validScope(key))throw Error('目录路径无效');
      const parts=key.split('/'),notebook=parts[0],path=parts.length===1?'/':'/'+parts.slice(1).join('/')+'.sy';
      // maxListCount=0 requests all direct children; no recursive body reads.
      const data=await json('/api/filetree/listDocsByPath',{notebook,path,maxListCount:0,ignoreMaxListHint:true,showHidden:true});
      if(!data||!Array.isArray(data.files))throw Error('文档目录响应无效，请刷新后重试');
      return data.files.map(file=>{
        const child=C.fromPath(notebook,file.path);
        if(child.slice(0,child.lastIndexOf('/'))!==key||!C.valid(file.id)||!child.endsWith('/'+file.id))throw Error('文档目录路径不一致，已停止加载');
        return {key:child,id:file.id,name:String(file.name||'未命名文档').replace(/\.sy$/,''),childCount:Math.max(0,Number(file.subFileCount)||0),kind:'document'};
      });
    }
    async function validateScopes(keys){
      for(const key of C.scopes(keys)){
        if(!key.includes('/'))continue;
        let current;try{current=await json('/api/filetree/getPathByID',{id:key.split('/').pop()});}catch{throw Error('待新增的文档目录暂不可用，请刷新后重新选择');}
        if(!current||C.fromPath(current.notebook,current.path)!==key)throw Error('文档位置已变化，请刷新目录后重新选择并预览');
      }
    }
    return {read:()=>readText(RULE),write:text=>writeText(RULE,text),backup,history,children,validateScopes,notebooks:()=>json('/api/notebook/lsNotebooks',{}).then(x=>(x.notebooks||[]).filter(n=>C.valid(n.id)).map(n=>({id:n.id,name:String(n.name||n.id),closed:!!n.closed}))),info:()=>json('/api/sync/getSyncInfo',{})};
  }
  return {RULE,BACKUP,create};
});

},
"./ui.js":function(module,exports,require){
(function(root,factory){if(typeof module==='object')module.exports=factory(require('./core.js'));else root.SyncScopeUI=factory(root.SyncScope);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function mount(root,io){
    root.innerHTML='<div class="scope-intro"><strong>选择要排除后续同步的目录</strong><p>可以排除整本笔记本，也可以展开后只选其中的文档目录。</p></div><div class="scope-notice">选中文档会包含它的全部子文档和以后新增的下级。本设备后续同步和数据快照将排除这些目录；本地原文保留，请另行备份。旧云端数据不自动清除，公共附件不自动排除，其他设备需分别设置。</div><div data-save-state class="scope-save-state" role="status"></div><p data-saved-range class="scope-hint"></p><div class="scope-tools"><input data-search type="search" placeholder="搜索已载入的目录" aria-label="搜索已载入的目录"><button data-refresh>刷新规则与目录</button></div><p class="scope-hint">点击箭头逐层展开；搜索只查已载入的目录。勾选上级会包含全部下级，部分勾选表示仅排除其中一些目录。</p><div data-list class="scope-list" aria-label="同步排除目录树"></div><details class="scope-selected"><summary data-selection-summary>已选范围</summary><div data-selected-list></div></details><p class="scope-hint">仅表示本插件管理的规则，手工规则原样保留。规则按当前位置保存：移动文档后请重新选择并应用，改标题不受影响。</p><p data-status role="status" class="scope-status"></p><div class="scope-actions"><button data-cancel disabled>取消</button><button data-reset disabled>重置</button><button data-apply class="scope-primary" disabled>确定排除</button></div>';
    const $=q=>root.querySelector(q),manager=new C.Manager(io);
    let books=[],nodes=new Map(),children=new Map(),expanded=new Set(),loading=new Set(),limits=new Map(),baseline='',selected=new Set(),saved=[],dead=false,busy=false,ready=false,epoch=0;
    function status(msg,error=false){if(dead)return;$('[data-status]').textContent=msg;$('[data-status]').classList.toggle('scope-error',error);}
    function dirty(){return JSON.stringify(C.scopes([...selected]))!==JSON.stringify(saved);}
    function counts(keys){const notebooks=keys.filter(k=>!k.includes('/')).length;return notebooks+' 本笔记本、'+(keys.length-notebooks)+' 个文档目录';}
    function label(key){return key.split('/').map((part,i,parts)=>nodes.get(parts.slice(0,i+1).join('/'))?.name||part).join(' / ');}
    function select(key,checked){if(busy||!ready)return;try{if(checked)selected=new Set(C.scopes([...selected,key]));else selected.delete(key);status('');render();}catch(e){status(e.message,true);}}
    function render(){
      if(dead)return;
      const filter=$('[data-search]').value.trim().toLowerCase(),list=$('[data-list]'),selectedKeys=[...selected],blocked=busy||!ready;
      const partial=new Set(),inherited=key=>selectedKeys.some(parent=>parent!==key&&C.contains(parent,key));
      for(const key of selectedKeys){let parent=key;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));partial.add(parent);}}
      const matches=new Set();if(filter)for(const [key,node] of nodes)if(node.name.toLowerCase().includes(filter)||key.includes(filter)){matches.add(key);let parent=key;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));matches.add(parent);}}
      list.replaceChildren();
      function append(node,depth){
        const key=node.key;if(filter&&!matches.has(key))return;
        const covered=inherited(key),checked=selected.has(key),row=document.createElement('div');row.className='scope-row';row.style.setProperty('--scope-depth',Math.min(depth,15));row.dataset.key=key;
        const toggle=document.createElement('button');toggle.type='button';toggle.className='scope-toggle';toggle.dataset.expand=key;
        const canExpand=node.kind==='notebook'||node.childCount>0;
        toggle.textContent=loading.has(key)?'…':expanded.has(key)||filter?'▾':'▸';toggle.disabled=blocked||loading.has(key)||!canExpand||node.closed;toggle.classList.toggle('scope-leaf',!canExpand);toggle.setAttribute('aria-label',(expanded.has(key)?'收起 ':'展开 ')+node.name);toggle.setAttribute('aria-expanded',String(expanded.has(key)||!!filter));
        toggle.addEventListener('click',()=>toggleNode(key));
        const field=document.createElement('label');field.className='scope-field';const box=document.createElement('input');box.type='checkbox';box.checked=checked||covered;box.indeterminate=!box.checked&&partial.has(key);box.disabled=blocked||covered;box.dataset.id=key;box.setAttribute('aria-label','排除 '+node.name);box.addEventListener('change',()=>select(key,box.checked));
        const text=document.createElement('span'),title=document.createElement('span'),sub=document.createElement('small');title.textContent=node.name;sub.textContent=node.closed?'已关闭 · 需打开笔记本后查看下级':node.kind==='notebook'?'笔记本':node.childCount?'文档目录 · '+node.childCount+' 个直接下级':'文档';text.append(title,sub);field.append(box,text);
        const badge=document.createElement('span');badge.className='scope-badge';badge.textContent=covered?'随上级排除':checked?(node.kind==='notebook'?'整本排除':'目录及下级排除'):partial.has(key)?'部分排除':'插件未排除';row.append(toggle,field,badge);list.append(row);
        if(expanded.has(key)||filter){const items=(children.get(key)||[]).filter(n=>!filter||matches.has(n.key)),limit=limits.get(key)||200;for(const child of items.slice(0,limit))append(child,depth+1);if(items.length>limit){const more=document.createElement('button');more.type='button';more.className='scope-more';more.textContent='再显示 '+Math.min(200,items.length-limit)+' 项（还有 '+(items.length-limit)+' 项）';more.disabled=blocked;more.addEventListener('click',()=>{limits.set(key,limit+200);render();});list.append(more);}if(children.has(key)&&!items.length&&!filter){const empty=document.createElement('p');empty.className='scope-empty';empty.textContent='此目录没有下级文档';list.append(empty);}}
      }
      for(const node of books)append(node,0);
      if(!list.children.length){const empty=document.createElement('p');empty.className='scope-empty';empty.textContent=filter?'没有匹配项，可清除搜索后展开更多目录':'没有可用的笔记本';list.append(empty);}
      const summary=$('[data-selected-list]');summary.replaceChildren();$('[data-selection-summary]').textContent='已选范围：'+counts(selectedKeys);
      for(const key of selectedKeys){const row=document.createElement('div');row.className='scope-selected-row';const name=document.createElement('span');name.textContent=label(key);name.title='/'+key;const remove=document.createElement('button');remove.type='button';remove.textContent='取消排除';remove.setAttribute('aria-label','取消排除 '+label(key));remove.disabled=blocked;remove.addEventListener('click',()=>select(key,false));row.append(name,remove);summary.append(row);}
      const changed=ready&&dirty(),state=$('[data-save-state]');
      state.textContent=busy?(ready?'正在保存，请稍候…':'正在读取设置…'):!ready?'设置尚未载入，暂不能保存':changed?'有未保存的修改，当前勾选尚未生效':'已保存，当前设置已生效';
      state.classList.toggle('scope-unsaved',changed);state.classList.toggle('scope-saved',ready&&!changed&&!busy);
      $('[data-saved-range]').textContent=ready?'上次保存：'+counts(saved)+'；当前勾选：'+counts(selectedKeys)+'。':'';
      $('[data-apply]').disabled=blocked||!changed;
      $('[data-cancel]').disabled=blocked||!changed;
      $('[data-reset]').disabled=blocked||!selected.size;
      $('[data-refresh]').disabled=busy||changed;
      $('[data-refresh]').title=changed?'请先确定排除或取消本次修改':'';
    }
    async function toggleNode(key){
      if(busy||!ready||loading.has(key))return;
      if(expanded.has(key)){expanded.delete(key);render();return;}
      if(children.has(key)){expanded.add(key);render();return;}
      const ticket=epoch;loading.add(key);render();
      try{const data=await io.children(key);if(dead||ticket!==epoch)return;children.set(key,data);for(const n of data)nodes.set(n.key,n);expanded.add(key);status('');}catch(e){if(ticket===epoch)status('目录加载失败：'+e.message,true);}finally{if(ticket===epoch){loading.delete(key);render();}}
    }
    async function load(){
      const ticket=++epoch;busy=true;ready=false;render();status('正在读取本设备规则…');
      try{const [state,data]=await Promise.all([manager.load(),io.notebooks()]);if(dead||ticket!==epoch)return;baseline=state.before;saved=C.scopes(state.ids);selected=new Set(saved);books=data.map(n=>({...n,key:n.id,kind:'notebook'}));nodes=new Map(books.map(n=>[n.key,n]));children=new Map();expanded=new Set();loading=new Set();limits=new Map();ready=true;status('');}catch(e){status(e.message,true);}finally{if(ticket===epoch){busy=false;render();}}
    }
    $('[data-search]').addEventListener('input',render);
    $('[data-refresh]').addEventListener('click',()=>{if(!busy)load();});
    $('[data-cancel]').addEventListener('click',()=>{
      if(busy||!ready)return;selected=new Set(saved);status('已取消本次修改，恢复上次保存的勾选。');render();
    });
    $('[data-reset]').addEventListener('click',()=>{
      if(busy||!ready)return;selected=new Set();status('勾选已清空，点击“确定排除”后才会生效；点击“取消”可恢复。');render();
    });
    $('[data-apply]').addEventListener('click',async()=>{
      if(busy||!ready||!dirty())return;
      let saving;try{saving=C.preview(baseline,[...selected]);}catch(e){status(e.message,true);return;}
      busy=true;render();status('正在保存…');
      try{await manager.apply(saving);if(dead)return;baseline=saving.after;saved=C.scopes(saving.ids);selected=new Set(saved);status('排除设置已保存。');}
      catch(e){status('保存未完成：'+e.message+'。本次勾选仍保留，可取消后刷新重试。',true);}
      finally{busy=false;render();}
    });
    load();return ()=>{dead=true;epoch++;};
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
  open(){if(this.dialog)return;this.dialog=new Dialog({title:'指定同步范围',content:'<div class="notebook-sync-scope"></div>',width:'900px',destroyCallback:()=>{this.dispose?.();this.dispose=null;this.dialog=null;}});this.dispose=UI.mount(this.dialog.element.querySelector('.notebook-sync-scope'),this.io);}
  onunload(){this.dispose?.();this.dialog?.destroy();this.dialog=null;}
};

}
};
const cache={};function load(name){if(name==="siyuan")return hostRequire(name);if(!Object.prototype.hasOwnProperty.call(factories,name))throw Error("Unsupported module");if(!cache[name]){const item={exports:{}};cache[name]=item;factories[name](item,item.exports,load);}return cache[name].exports;}return load("./entry.js");})();
