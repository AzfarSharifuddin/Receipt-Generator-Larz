const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {useMobileApp,mobileKeyboardOpen}=require('../src/mobile-app.js');
const source=fs.readFileSync(require.resolve('../src/mobile-app.js'),'utf8');
function harness({standalone=true,ios=false,width=390}={}){
 function node(){return {attrs:{},events:{},dataset:{},hidden:false,textContent:'',classList:{values:new Set(),toggle(k,v){if(v)this.values.add(k);else this.values.delete(k)},add(k){this.values.add(k)},remove(k){this.values.delete(k)}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,fn){(this.events[k]??=[]).push(fn)},dispatch(k,event={}){for(const fn of this.events[k]||[])fn(event)},focus(){this.focused=true},before(n){n.parentElement=this.parentElement},after(n){n.parentElement=this.parentElement},append(n){n.parentElement=this},matches(){return false},getBoundingClientRect(){return {left:0,right:390,top:400,bottom:844}}}}
 const body=node(),html=node(),sidebar=node(),dialog=node(),menu=node(),close=node(),title=node(),heading=node(),badge=node();sidebar.parentElement=body;badge.hidden=true;
 dialog.showModal=()=>{dialog.open=true};dialog.close=()=>{if(!dialog.open)return;dialog.open=false;dialog.dispatch('close')};
 const pages=['editor','orders','inventory','revenue','history','settings'].map(page=>({...node(),dataset:{page}}));sidebar.querySelectorAll=()=>pages;
 const buttons=['editor','orders','inventory','more'].map(page=>({...node(),dataset:{mobilePage:page}})),copyBadge=node();let tabs,observer,shown=[],current='editor',draft={customer:'Unfinished entry'};
 const portrait={matches:width<=650,addEventListener(k,fn){(this.handlers??=[]).push(fn)}},compact={matches:width<=1000,addEventListener(k,fn){(this.handlers??=[]).push(fn)}},display={matches:standalone,addEventListener(k,fn){(this.handlers??=[]).push(fn)}};
 const viewport={height:844,scale:1,addEventListener(k,fn){this[k]=fn}};
 const context={navigator:{standalone:ios},document:{body,documentElement:html,activeElement:null,querySelector:q=>q==='.sidebar'?sidebar:{id:current},createComment:()=>node(),createElement(){tabs=node();tabs.querySelector=q=>q==='.mobile-orders-count'?copyBadge:buttons.find(b=>q.includes('"'+b.dataset.mobilePage+'"'));tabs.querySelectorAll=()=>buttons;return tabs},addEventListener(k,fn){this[k]=fn}},$:q=>({'#mobile-navigation':dialog,'#mobile-menu-button':menu,'#mobile-navigation-close':close,'#page-title':title,'#mobile-navigation-title':heading,'#orders-badge':badge})[q],window:{innerWidth:width,innerHeight:844,visualViewport:viewport,matchMedia:q=>q==='(max-width:650px)'?portrait:q==='(max-width:1000px)'?compact:display,addEventListener(){},scrollTo(){}},show:page=>{shown.push(page);current=page},requestAnimationFrame:fn=>fn(),MutationObserver:class{constructor(fn){observer=fn}observe(){}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/navigation.js'),'utf8'),context);const browserShow=context.show;
 vm.runInContext(source,context);
 function tap(page){const button=buttons.find(b=>b.dataset.mobilePage===page);tabs.dispatch('click',{target:{closest:()=>button}})}
 function resize(w){context.window.innerWidth=w;portrait.matches=w<=650;compact.matches=w<=1000;for(const fn of portrait.handlers||[])fn();for(const fn of compact.handlers||[])fn()}
 return {context,body,html,sidebar,dialog,menu,close,title,heading,pages,buttons,copyBadge,badge,tabs,viewport,shown,draft,tap,resize,browserShow,observeBadge:()=>observer()};
}
(async()=>{
 for(const width of [320,390,430,844,1000]){assert(useMobileApp(true,width));assert(!useMobileApp(false,width))}assert(!useMobileApp(true,1001));
 assert(mobileKeyboardOpen(true,844,500));assert(!mobileKeyboardOpen(false,844,500));assert(!mobileKeyboardOpen(true,844,800));assert(!mobileKeyboardOpen(true,844,500,2));
 for(const width of [390,1440]){const h=harness({standalone:false,width});assert.equal(h.tabs,undefined);assert.equal(h.context.show,h.browserShow);assert(!h.body.classList.values.has('mobile-app-ui'));assert.equal(h.heading.textContent,'')}
 const h=harness();assert(h.body.classList.values.has('mobile-app-ui'));assert.equal(h.sidebar.parentElement,h.dialog);assert.equal(h.heading.textContent,'More');
 h.tap('orders');assert.equal(h.shown.at(-1),'orders');assert.equal(h.buttons[1].attrs['aria-current'],'page');
 h.tap('editor');assert.equal(h.draft.customer,'Unfinished entry');assert.equal(h.shown.at(-1),'editor');
 h.tap('more');assert(h.dialog.open);assert.equal(h.buttons[3].attrs['aria-expanded'],'true');h.close.onclick();assert(!h.dialog.open);assert(h.buttons[3].focused);
 h.context.show('settings');assert.equal(h.buttons[3].attrs['aria-current'],'page');
 h.badge.hidden=false;h.badge.textContent='105';h.observeBadge();assert.equal(h.copyBadge.textContent,'99+');assert.equal(h.buttons[1].attrs['aria-label'],'Orders, 105 pending');h.badge.hidden=true;h.observeBadge();assert(h.copyBadge.hidden);
 h.context.document.activeElement={matches:()=>true};h.viewport.height=500;h.viewport.resize();assert(h.body.classList.values.has('mobile-app-keyboard'));h.viewport.height=844;h.viewport.resize();assert(!h.body.classList.values.has('mobile-app-keyboard'));
 h.resize(844);h.tap('more');assert(h.dialog.open);assert.equal(h.sidebar.parentElement,h.dialog);let stopped=false;h.sidebar.dispatch('click',{target:{closest:()=>h.pages[4]},preventDefault(){},stopImmediatePropagation(){stopped=true}});assert(stopped);assert.equal(h.shown.at(-1),'history');assert(!h.dialog.open);
 h.resize(1200);assert(!h.body.classList.values.has('mobile-app-ui'));assert.equal(h.sidebar.parentElement,h.body);assert.equal(h.heading.textContent,'Pages');h.resize(390);assert(h.body.classList.values.has('mobile-app-ui'));assert.equal(h.sidebar.parentElement,h.dialog);
 assert(harness({standalone:false,ios:true}).body.classList.values.has('mobile-app-ui'));
 // All presentation overrides require the installed-app class; Inventory and paper have no overrides.
 const css=fs.readFileSync(require.resolve('../src/mobile-app.css'),'utf8');
 for(const block of css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{[^{}]*\}/g)){
  const selectors=block[1].trim();if(selectors.startsWith('@'))continue;
  for(const selector of selectors.replace(/\([^)]*\)/g,'').split(',')){assert(selector.includes('mobile-app-ui')||selector.trim()==='#mobile-app-tabs',selector)}
 }
 assert(!css.includes('#inventory'));assert(!css.includes('.paper'));
 const auth=require('../lib/auth.cjs');auth.user=async req=>req.headers.cookie==='test-session'?{id:'test'}:null;const server=require('../server.cjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;for(const asset of ['/src/mobile-app.js','/src/mobile-app.css']){assert.equal((await fetch(base+asset,{redirect:'manual'})).status,303);assert.equal((await fetch(base+asset,{headers:{cookie:'test-session'}})).status,200)}}finally{await new Promise(resolve=>server.close(resolve))}
 console.log('Installed app passed: browser no-op, iOS detection, navigation/draft preservation, More/focus, order badge, keyboard spacing, orientation cleanup, scoped styling and authenticated assets.');
})().catch(error=>{console.error(error);process.exitCode=1});
