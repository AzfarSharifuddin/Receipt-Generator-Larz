'use strict';
function mobileSavedDocumentMatches(document, filters) {
 const status=['confirmed','draft','cancelled','legacy','local'].includes(document.status)?document.status:'local';
 return (filters.type==='all'||document.type===filters.type)&&(filters.status==='all'||status===filters.status)&&(!filters.from||document.date>=filters.from)&&(!filters.to||document.date<=filters.to);
}
function mobileRevenueDates(months, now=new Date()) {
 const start=new Date(now.getFullYear(),now.getMonth()-Number(months)+1,1);
 const iso=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 return {from:iso(start),to:iso(now)};
}
// Positions stay in memory for this tab. In-flight page renders may need a
// second attempt once their list finishes loading; user scrolling always wins.
class MobilePageScrollMemory {
 constructor({getY,setY,getMax,queue,isBusy}){Object.assign(this,{getY,setY,getMax,queue,isBusy});this.positions=new Map();this.active=null;this.pending=null;this.queued=false}
 remember(){if(this.active&&!this.pending)this.positions.set(this.active,this.getY())}
 visit(key){this.remember();this.active=key;this.pending={key,y:this.positions.get(key)||0};this.retry()}
 retry(){if(!this.pending||this.queued)return;this.queued=true;this.queue(()=>{this.queued=false;const pending=this.pending;if(!pending)return;const max=Math.max(0,this.getMax());this.setY(Math.min(pending.y,max));if(pending.y>max&&this.isBusy())return;this.queue(()=>{if(this.pending!==pending)return;this.pending=null;this.positions.set(this.active,this.getY())})})}
 cancel(){this.pending=null;this.remember()}
 reset(key=this.active){if(!key)return;this.positions.set(key,0);if(key===this.active){this.pending={key,y:0};this.retry()}}
}
if(typeof module==='object'&&module.exports){module.exports={mobileSavedDocumentMatches,mobileRevenueDates,MobilePageScrollMemory}}else(()=>{
 // The desktop/browser version retains its existing controls and navigation.
 if(!window.matchMedia('(display-mode: standalone)').matches&&navigator.standalone!==true)return;
 let enabled=document.body.classList.contains('mobile-app-ui');
 const defaultSaved=()=>({type:'all',status:'all',from:'',to:''});
 let savedFilters=defaultSaved(),openPage=null,opener=null,lockedY=0;
 const currentPage=()=>document.querySelector('.page:not([hidden])')?.id||'editor';
 const pageKey=page=>page==='editor'?'editor:'+doc.id:page;
 const scrollMemory=new MobilePageScrollMemory({
  getY:()=>window.scrollY,
  setY:y=>window.scrollTo({top:y,left:0,behavior:'instant'}),
  getMax:()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)-window.innerHeight,
  queue:callback=>requestAnimationFrame(callback),
  isBusy:()=>currentPage()==='orders'?$('#orders-list').getAttribute('aria-busy')==='true':currentPage()==='revenue'&&typeof revenueLoading!=='undefined'&&revenueLoading
 });
 scrollMemory.active=pageKey(currentPage());
 window.mobileDocumentMatches=document=>!enabled||mobileSavedDocumentMatches(document,savedFilters);
 const icon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 6h7m6 0h3M4 12h2m6 0h8M4 18h10m6 0h0"/><circle cx="14" cy="6" r="3"/><circle cx="9" cy="12" r="3"/><circle cx="17" cy="18" r="3"/></svg>';
 const buttons=new Map();
 for(const [page,label,parent] of [['history','Filter saved documents','#history .history-toolbar'],['revenue','Filter revenue','#revenue .revenue-controls'],['orders','Filter orders','#orders .orders-search-row']]){
  const button=document.createElement('button');button.type='button';button.className='secondary mobile-filter-button';button.innerHTML=icon+'<span class="mobile-filter-count" hidden></span>';button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','mobile-filter-dialog');button.setAttribute('aria-expanded','false');button.onclick=()=>openFilters(page,button);$(parent).append(button);buttons.set(page,button);
 }
 const revenueSummary=document.createElement('div');revenueSummary.className='mobile-revenue-filter-summary';$('#revenue .revenue-controls').prepend(revenueSummary);
 const historySummary=document.createElement('p');historySummary.className='mobile-history-filter-summary';historySummary.hidden=true;$('#history .history-toolbar').after(historySummary);
 const dialog=document.createElement('dialog');dialog.id='mobile-filter-dialog';dialog.setAttribute('aria-labelledby','mobile-filter-title');
 dialog.innerHTML='<div class="mobile-filter-handle" aria-hidden="true"></div><div class="mobile-filter-heading"><h2 id="mobile-filter-title"></h2><button type="button" class="secondary mobile-filter-close" aria-label="Close filters">×</button></div><div id="mobile-filter-fields"></div><p id="mobile-filter-error" role="alert" hidden></p><div class="mobile-filter-actions"><button type="button" class="secondary" id="mobile-filter-reset">Reset</button><button type="button" class="primary" id="mobile-filter-apply">Apply filters</button></div>';
 document.body.append(dialog);
 const fields=dialog.querySelector('#mobile-filter-fields');
 const draftFields=new Map();
 function addField(key,label,{source,options,type='select',value=''}){
  const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.htmlFor='mobile-filter-'+key;
  const input=source?source.cloneNode(true):document.createElement(type==='select'?'select':'input');input.id='mobile-filter-'+key;input.removeAttribute('name');input.removeAttribute('aria-labelledby');input.removeAttribute('aria-label');input.disabled=false;input.readOnly=false;
  if(!source&&type!=='select')input.type=type;
  if(options)input.innerHTML=options.map(([v,text])=>`<option value="${v}">${text}</option>`).join('');
  input.value=source?source.value:value;wrapper.append(input);fields.append(wrapper);draftFields.set(key,input);return input;
 }
 const read=key=>draftFields.get(key).value;
 const write=(key,value)=>{draftFields.get(key).value=value};
 function updateSummaries(){
  const savedCount=Number(savedFilters.type!=='all')+Number(savedFilters.status!=='all')+Number(!!(savedFilters.from||savedFilters.to))+Number($('#document-sort').value!=='newest');
  const savedBadge=buttons.get('history').querySelector('.mobile-filter-count');savedBadge.hidden=!savedCount;savedBadge.textContent=savedCount;
  historySummary.hidden=!savedCount;
  historySummary.textContent=[savedFilters.type==='all'?'':savedFilters.type==='invoice'?'Invoices':'Receipts',savedFilters.status==='all'?'':({confirmed:'Confirmed',draft:'Draft',cancelled:'Cancelled',legacy:'Historical',local:'Local only'}[savedFilters.status]),savedFilters.from||savedFilters.to?[savedFilters.from||'Any date',savedFilters.to||'Any date'].join(' – '):'',$('#document-sort').value==='oldest'?'Oldest first':''].filter(Boolean).join(' · ');
  const period=$('#revenue-period');revenueSummary.textContent=period.options[period.selectedIndex]?.textContent+' · '+($('#revenue-currency').value==='MYR'?'RM':'US$');
  const dates=document.createElement('small');dates.textContent=$('#revenue-from').value+' – '+$('#revenue-to').value;revenueSummary.append(dates);
  const orderCount=Number($('#orders-sort').value!=='oldest');const orderBadge=buttons.get('orders').querySelector('.mobile-filter-count');orderBadge.hidden=!orderCount;orderBadge.textContent=orderCount;
 }
 function openFilters(page,button){
  if(!enabled||dialog.open)return;
  openPage=page;opener=button;fields.replaceChildren();draftFields.clear();$('#mobile-filter-error').hidden=true;
  $('#mobile-filter-title').textContent={history:'Document filters',revenue:'Revenue filters',orders:'Order filters'}[page];
  if(page==='history'){
   addField('type','Document type',{options:[['all','All documents'],['invoice','Invoices'],['receipt','Receipts']],value:savedFilters.type});
   addField('status','Status',{options:[['all','All statuses'],['confirmed','Confirmed'],['draft','Draft'],['cancelled','Cancelled'],['legacy','Historical'],['local','Local only']],value:savedFilters.status});
   addField('from','From',{type:'date',value:savedFilters.from});addField('to','To',{type:'date',value:savedFilters.to});
   addField('sort','Sort by issue date',{source:$('#document-sort')});
  }else if(page==='revenue'){
   for(const [key,label] of [['period','Period'],['currency','Currency'],['from','From'],['to','To']])addField(key,label,{source:$('#revenue-'+key)});
  }else{
   addField('status','Order status',{options:[['pending','Pending'],['approved','Approved'],['rejected','Rejected']],value:document.querySelector('[data-order-status][aria-selected="true"]').dataset.orderStatus});
   addField('sort','Sort orders',{source:$('#orders-sort')});
  }
  $('#mobile-filter-apply').textContent=page==='history'?'Show documents':'Apply filters';
  scrollMemory.remember();lockedY=window.scrollY;
  document.documentElement.classList.add('mobile-filter-open');document.body.classList.add('mobile-filter-open');button.setAttribute('aria-expanded','true');dialog.showModal();dialog.querySelector('.mobile-filter-close').focus();
 }
 function unlock(){document.documentElement.classList.remove('mobile-filter-open');document.body.classList.remove('mobile-filter-open');for(const button of buttons.values())button.setAttribute('aria-expanded','false')}
 function closeFilters({restoreScroll=true,focus=true}={}){
  if(!dialog.open)return;unlock();dialog.close();openPage=null;
  if(restoreScroll)window.scrollTo({top:lockedY,left:0,behavior:'instant'});
  if(focus&&opener?.isConnected)opener.focus({preventScroll:true});opener=null;
 }
 dialog.addEventListener('close',unlock);
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeFilters()});
 dialog.querySelector('.mobile-filter-close').onclick=()=>closeFilters();
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeFilters()});
 fields.addEventListener('change',event=>{
  $('#mobile-filter-error').hidden=true;if(openPage!=='revenue')return;
  if(event.target===draftFields.get('period')&&read('period')!=='custom'){const dates=mobileRevenueDates(read('period'));write('from',dates.from);write('to',dates.to)}
  else if(event.target===draftFields.get('from')||event.target===draftFields.get('to'))write('period','custom');
 });
 $('#mobile-filter-reset').onclick=()=>{
  $('#mobile-filter-error').hidden=true;
  if(openPage==='history'){for(const [key,value] of Object.entries({...defaultSaved(),sort:'newest'}))write(key,value)}
  else if(openPage==='revenue'){for(const [key,value] of Object.entries({period:'6',currency:'MYR',...mobileRevenueDates(6)}))write(key,value)}
  else{write('status','pending');write('sort','oldest')}
 };
 $('#mobile-filter-apply').onclick=()=>{
  if(!enabled||!dialog.open)return;
  try{
   if(openPage==='revenue')RevenueData.report([],read('from'),read('to'),read('currency'));
   else if(openPage==='history'&&read('from')&&read('to')&&read('from')>read('to'))throw Error('From date must be on or before To date.');
  }catch(error){$('#mobile-filter-error').textContent=error.message;$('#mobile-filter-error').hidden=false;return}
  const page=openPage;
  if(page==='history'){savedFilters={type:read('type'),status:read('status'),from:read('from'),to:read('to')};$('#document-sort').value=read('sort');closeFilters({restoreScroll:false});history()}
  else if(page==='revenue'){
   for(const key of ['period','currency','from','to'])$('#revenue-'+key).value=read(key);
   closeFilters({restoreScroll:false});$('#revenue-currency').dispatchEvent(new Event('change',{bubbles:true}));
  }else{
   const status=read('status'),current=document.querySelector('[data-order-status][aria-selected="true"]').dataset.orderStatus;$('#orders-sort').value=read('sort');closeFilters({restoreScroll:false});
   if(status!==current)setOrderStatus(status);else $('#orders-sort').dispatchEvent(new Event('change',{bubbles:true}));
  }
  updateSummaries();scrollMemory.reset(pageKey(page));
 };
 const beforeRender=render;
 render=function(){
  if(enabled&&currentPage()==='editor'&&scrollMemory.active!==pageKey('editor'))scrollMemory.visit(pageKey('editor'));
  return beforeRender();
 };
 const beforeShow=show;
 show=function(page){
  if(!enabled)return beforeShow(page);
  if(dialog.open)closeFilters({focus:false});
  scrollMemory.visit(pageKey(page));beforeShow(page);updateSummaries();
 };
 window.addEventListener('scroll',()=>{if(enabled&&!document.documentElement.classList.contains('mobile-menu-open')&&!document.documentElement.classList.contains('mobile-filter-open'))scrollMemory.remember()},{passive:true});
 const stopRestoring=event=>{if(!enabled||dialog.open||event.target.closest?.('dialog'))return;if(event.type==='keydown'&&!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))return;scrollMemory.cancel()};
 for(const type of ['wheel','touchstart','keydown'])window.addEventListener(type,stopRestoring,{passive:type!=='keydown'});
 new MutationObserver(()=>{if(enabled)scrollMemory.retry()}).observe(document.querySelector('main'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-busy']});
 document.addEventListener('change',event=>{if(enabled&&['document-sort','revenue-period','revenue-currency','revenue-from','revenue-to','orders-sort'].includes(event.target.id))updateSummaries()});
 document.addEventListener('input',event=>{if(enabled&&['search','orders-search'].includes(event.target.id))scrollMemory.reset(pageKey(currentPage()))});
 new MutationObserver(()=>{
  const next=document.body.classList.contains('mobile-app-ui');if(next===enabled)return;enabled=next;
  closeFilters({restoreScroll:false,focus:false});scrollMemory.cancel();
  if(enabled){scrollMemory.active=pageKey(currentPage());updateSummaries()}
  history();
 }).observe(document.body,{attributes:true,attributeFilter:['class']});
 updateSummaries();
})();
