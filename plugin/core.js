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
