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
