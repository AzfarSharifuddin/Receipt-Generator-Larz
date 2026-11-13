const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(mobile=true){
 function node(){return {attrs:{},events:{},classList:{values:new Set(),toggle(key,value){if(value)this.values.add(key);else this.values.delete(key)},add(key){this.values.add(key)}},setAttribute(key,value){this.attrs[key]=value},removeAttribute(key){delete this.attrs[key]},addEventListener(type,handler){this.events[type]=handler},focus(){this.focused=true},before(other){other.parentElement=this.parentElement},after(other){other.parentElement=this.parentElement},append(other){other.parentElement=this},getBoundingClientRect(){return {left:40,right:390,top:0,bottom:844}}}}
 const body=node(),html=node(),sidebar=node(),dialog=node(),menu=node(),close=node(),title=node(),marker=node();sidebar.parentElement=body;dialog.open=false;dialog.showModal=()=>{dialog.open=true};dialog.close=()=>{dialog.open=false;dialog.events.close?.()};
 const pages=['editor','orders','inventory','revenue','history','settings'].map(page=>({...node(),dataset:{page}}));sidebar.querySelectorAll=()=>pages;
 const media={matches:mobile,addEventListener(type,handler){this.change=handler}},shown=[],scrolled=[],draft={customer:'Unfinished customer'},signout={csrf:'original-token'};sidebar.signout=signout;
 const context={document:{querySelector:selector=>selector==='.sidebar'?sidebar:{id:'editor'},createComment:()=>marker,body,documentElement:html},$:selector=>({'#mobile-navigation':dialog,'#mobile-menu-button':menu,'#mobile-navigation-close':close,'#page-title':title})[selector],window:{matchMedia:()=>media,scrollTo:options=>scrolled.push(options)},show:page=>shown.push(page)};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/navigation.js'),'utf8'),context);
 const tap=button=>{const event={target:{closest:()=>button},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};sidebar.events.click(event);return event};
 return {context,body,html,sidebar,dialog,menu,close,title,pages,media,shown,scrolled,draft,signout,tap,marker};
}
(async()=>{
 let h=harness();assert.equal(h.sidebar.parentElement,h.dialog);assert.equal(h.sidebar.signout,h.signout);assert.equal(h.pages[0].attrs['aria-current'],'page');assert(h.body.classList.values.has('mobile-navigation-ready'));
 h.menu.onclick();assert(h.dialog.open);assert.equal(h.menu.attrs['aria-expanded'],'true');assert(h.close.focused);assert(h.html.classList.values.has('mobile-menu-open'));
 h.dialog.events.close();assert.equal(h.menu.attrs['aria-expanded'],'true');assert(h.html.classList.values.has('mobile-menu-open')); // ignore a delayed close after reopening
 const event=h.tap(h.pages[2]);assert(event.prevented&&event.stopped);assert.equal(h.shown.at(-1),'inventory');assert(!h.dialog.open);assert(h.title.focused);assert.equal(h.pages[2].attrs['aria-current'],'page');assert(!h.html.classList.values.has('mobile-menu-open'));
 h.menu.onclick();h.tap(h.pages[0]);assert.equal(h.shown.at(-1),'editor');assert.equal(h.draft.customer,'Unfinished customer');assert.equal(h.sidebar.signout.csrf,'original-token');
 h.menu.onclick();let prevented=false;h.dialog.events.cancel({preventDefault(){prevented=true}});assert(prevented);assert(!h.dialog.open);assert(h.menu.focused);
 h.menu.onclick();h.dialog.events.click({target:h.dialog,clientX:5,clientY:200});assert(!h.dialog.open);
 h.menu.onclick();h.media.matches=false;h.media.change();assert(!h.dialog.open);assert.equal(h.sidebar.parentElement,h.body);assert(!h.body.classList.values.has('mobile-menu-open'));h.menu.onclick();assert(!h.dialog.open);assert(!h.tap(h.pages[1]).stopped);
 h.media.matches=true;h.media.change();assert.equal(h.sidebar.parentElement,h.dialog);assert.equal(h.pages.length,6);assert.equal(h.sidebar.signout,h.signout);
 h=harness(false);assert.equal(h.sidebar.parentElement,h.body);assert(!h.tap(h.pages[0]).stopped);assert(!h.dialog.open);
 const auth=require('../lib/auth.cjs');auth.user=async req=>req.headers.cookie==='test-session'?{id:'test'}:null;const server=require('../server.cjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;for(const file of ['/src/navigation.js','/src/navigation.css']){assert.equal((await fetch(base+file,{redirect:'manual'})).status,303);assert.equal((await fetch(base+file,{headers:{cookie:'test-session'}})).status,200)}const response=await fetch(base+'/',{headers:{cookie:'test-session'}}),html=await response.text();assert.equal((html.match(/action="\/logout"/g)||[]).length,1);assert.match(html,/<form class="sign-out-form" method="post" action="\/logout"><input type="hidden" name="csrf" value="[a-f0-9]{64}">/)}finally{await new Promise(resolve=>server.close(resolve))}
 console.log('Navigation passed: one shared sidebar/sign-out form, mobile page switching, active page, Escape/backdrop dismissal, focus, resize cleanup, desktop behavior, private assets and CSRF.');
})().catch(error=>{console.error(error);process.exitCode=1});
