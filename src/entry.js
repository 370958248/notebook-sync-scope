'use strict';
const {Plugin,Dialog}=require('siyuan'),IO=require('./io.js'),UI=require('./ui.js');
module.exports=class NotebookSyncScope extends Plugin{
  async onload(){this.io=IO.create((...args)=>fetch(...args));this.addIcons('<symbol id="iconNotebookSyncScope" viewBox="0 0 32 32"><path d="M8 24a7 7 0 0 1-1-14 9 9 0 0 1 17 1 6 6 0 0 1 0 13H8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 28 27 4" stroke="currentColor" stroke-width="3"/></symbol>');this.addCommand({langKey:'openSyncScope',langText:'打开指定同步范围',callback:()=>this.open()});}
  onLayoutReady(){this.addTopBar({icon:'iconNotebookSyncScope',title:'指定同步范围',position:'right',callback:()=>this.open()});}
  open(){if(this.dialog)return;this.dialog=new Dialog({title:'指定同步范围',content:'<div class="notebook-sync-scope"></div>',width:'900px',destroyCallback:()=>{this.dispose?.();this.dispose=null;this.dialog=null;}});this.dispose=UI.mount(this.dialog.element.querySelector('.notebook-sync-scope'),this.io);}
  onunload(){this.dispose?.();this.dialog?.destroy();this.dialog=null;}
};
