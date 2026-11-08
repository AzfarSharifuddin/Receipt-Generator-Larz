(function(root){
 'use strict';
 class OrderVerification{
  constructor({container,status,retry,onChange}){this.container=container;this.status=status;this.retry=retry;this.onChange=onChange;this.token='';this.widgetId=null;this.siteKey='';this.generation=0;this.loading=false;retry.onclick=()=>this.reset()}
  message(text,retry=false){this.token='';this.status.textContent=text;this.status.hidden=!text;this.retry.hidden=!retry;this.onChange()}
  configure(config){
   this.destroy();this.siteKey=config?.ready?config.siteKey:'';
   if(!this.siteKey){this.message('Ordering is temporarily unavailable. Please try again later.');return}
   this.load();
  }
  load(){
   if(!this.siteKey||this.loading)return;
   this.message('Checking security…');
   if(root.turnstile){this.render();return}
   this.loading=true;
   const script=root.document.createElement('script');this.script=script;
   script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
   script.onload=()=>{this.loading=false;this.render()};
   script.onerror=()=>{this.loading=false;script.remove();this.message('Security check could not load. Check your connection or content blocker, then retry.',true)};
   root.document.head.append(script);
  }
  render(){
   if(!this.siteKey||!root.turnstile)return;
   const generation=++this.generation;
   try{
    this.widgetId=root.turnstile.render(this.container,{sitekey:this.siteKey,action:'public_order',theme:'light',size:this.container.clientWidth<300?'compact':'flexible',appearance:'interaction-only','response-field':false,'refresh-expired':'auto',callback:token=>{if(generation!==this.generation)return;this.token=token;this.status.hidden=true;this.retry.hidden=true;this.onChange()},'expired-callback':()=>{if(generation===this.generation)this.message('Security check expired. Verifying again…')},'timeout-callback':()=>{if(generation===this.generation)this.message('Security check timed out. Please retry.',true)},'error-callback':()=>{if(generation===this.generation)this.message('Security check could not complete. Please retry.',true);return true}});
   }catch{this.message('Security check could not start. Please retry.',true)}
  }
  reset(){if(!this.siteKey)return;this.message('Checking security…');try{if(root.turnstile&&this.widgetId!==null)root.turnstile.reset(this.widgetId);else this.load()}catch{this.message('Security check could not restart. Please retry.',true)}}
  destroy(){this.generation++;if(root.turnstile&&this.widgetId!==null)root.turnstile.remove(this.widgetId);this.widgetId=null;this.token=''}
 }
 root.OrderVerification=OrderVerification;
 if(typeof module!=='undefined')module.exports=OrderVerification;
})(typeof window!=='undefined'?window:globalThis);
