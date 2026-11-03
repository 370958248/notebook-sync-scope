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
