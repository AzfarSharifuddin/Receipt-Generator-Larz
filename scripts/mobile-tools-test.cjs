const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {mobileSavedDocumentMatches:matches,mobileRevenueDates,MobilePageScrollMemory}=require('../src/mobile-tools.js');
const all={type:'all',status:'all',from:'',to:''};
const invoice={type:'invoice',status:'confirmed',date:'2026-11-15'};
assert(matches(invoice,all));assert(matches(invoice,{...all,type:'invoice',status:'confirmed',from:'2026-11-15',to:'2026-11-15'}));
for(const change of [{type:'receipt'},{status:'draft'},{from:'2026-11-16'},{to:'2026-11-14'}])assert(!matches(invoice,{...all,...change}));
assert(matches({type:'receipt',date:'2026-11-15'},{...all,status:'local'}));assert(matches({...invoice,status:'legacy'},{...all,status:'legacy'}));
assert.deepEqual(mobileRevenueDates(6,new Date(2026,10,15)),{from:'2026-06-01',to:'2026-11-15'});
assert.deepEqual(mobileRevenueDates(3,new Date(2026,0,2)),{from:'2025-11-01',to:'2026-01-02'});
assert.deepEqual(mobileRevenueDates(1,new Date(2024,1,29)),{from:'2024-02-01',to:'2024-02-29'});
let y=520,max=2000,busy=false,frames=[];
const memory=new MobilePageScrollMemory({getY:()=>y,setY:value=>y=value,getMax:()=>max,queue:fn=>frames.push(fn),isBusy:()=>busy});
function flush(){let limit=20;while(frames.length){assert(limit-->0,'Unbounded animation loop');frames.shift()()}}
memory.active='editor:first';memory.visit('history');y=0;flush();assert.equal(y,0);assert.equal(memory.positions.get('editor:first'),520);
y=860;memory.remember();memory.visit('inventory');y=0;flush();y=140;memory.remember();memory.visit('history');
// A navigation handler's scrollTo(0) and a temporarily short loading list may
// not erase the saved position. Restore when asynchronous list content arrives.
y=0;max=200;busy=true;flush();assert.equal(y,200);assert(memory.pending);assert.equal(memory.positions.get('history'),860);
max=2000;busy=false;memory.retry();flush();assert.equal(y,860);assert.equal(memory.pending,null);
memory.visit('inventory');flush();assert.equal(y,140);memory.visit('editor:first');flush();assert.equal(y,520);
memory.visit('editor:new');flush();assert.equal(y,0);y=320;memory.remember();memory.reset();flush();assert.equal(y,0);
memory.visit('history');max=100;busy=true;flush();y=40;memory.cancel();max=2000;busy=false;memory.retry();flush();assert.equal(y,40,'User scrolling cancels pending restoration');
memory.visit('inventory');memory.visit('history');flush();assert.equal(y,40,'A stale scheduled restore must not affect the latest page');
memory.visit('inventory');max=50;flush();assert.equal(y,50,'Deleted/shorter content clamps to its available height');
// Ordinary browser tabs must not install sheet controls or show wrappers.
const originalShow=()=>{};const context={window:{matchMedia:()=>({matches:false})},navigator:{standalone:false},show:originalShow,document:new Proxy({},{get(){throw Error('Browser DOM must remain untouched')}})};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/mobile-tools.js'),'utf8'),context);assert.equal(context.show,originalShow);assert.equal(context.window.mobileDocumentMatches,undefined);
// Exercise the actual history renderer with the optional mobile predicate.
const app=fs.readFileSync(require.resolve('../src/app.js'),'utf8'),list={innerHTML:''};
const historyContext={db:{documents:[{id:'invoice',customer:'TEST',number:'INV-1',...invoice},{id:'receipt',customer:'TEST',number:'REC-1',type:'receipt',date:'2026-11-15'}]},$:id=>id==='#search'?{value:''}:list,compareDocumentDates:()=>0,savedDocumentCard:d=>d.id,mobileDocumentMatches:d=>matches(d,{...all,type:'receipt'})};
vm.createContext(historyContext);vm.runInContext(app.slice(app.indexOf('function history(){'),app.indexOf('function closeHistoryMenu(')),historyContext);historyContext.history();assert.equal(list.innerHTML,'receipt');delete historyContext.mobileDocumentMatches;historyContext.history();assert.equal(list.innerHTML,'invoicereceipt');
(async()=>{
 const auth=require('../lib/auth.cjs');auth.user=async req=>req.headers.cookie==='test-session'?{id:'test'}:null;const server=require('../server.cjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;for(const asset of ['/src/mobile-tools.js','/src/mobile-tools.css']){assert.equal((await fetch(base+asset,{redirect:'manual'})).status,303);assert.equal((await fetch(base+asset,{headers:{cookie:'test-session'}})).status,200)}}finally{await new Promise(resolve=>server.close(resolve))}
 console.log('Mobile tools passed: browser isolation, saved-document filtering, local calendar ranges, per-page/document scroll memory, async rendering, user-scroll cancellation, shortened lists and private assets.');
})().catch(error=>{console.error(error);process.exitCode=1});
