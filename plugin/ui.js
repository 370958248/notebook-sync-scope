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
