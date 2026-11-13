const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),core=require('../src/core.js');
const source=fs.readFileSync(require.resolve('../src/document-save.js'),'utf8');
const business={name:'TEST workspace',address:'',email:'',phone:'',registration:'',payment:'',terms:'',currency:'MYR',logo:''};
const fixture=()=>({id:crypto.randomUUID(),number:'INV-2026-AUTO',type:'invoice',date:'2026-11-13',due:'',currency:'MYR',customer:'TEST customer',address:'',email:'',reference:'',items:[{productId:crypto.randomUUID(),description:'TEST product',qty:1,price:10}],discount:0,discountType:'fixed',tax:0,shipping:0,shippingCost:0,paid:0,paymentDate:'2026-11-13',method:'Cash',paymentReference:'',notes:'',terms:'',payment:'',business});
function harness(draft=fixture(),pending){
 const nodes=new Map(),dialogs=[],messages=[],writes=[],requests=[];
 const node=()=>({disabled:false,setAttribute(){},addEventListener(type,fn){this.listeners??={};this.listeners[type]=fn},showModal(){this.open=true},close(){this.open=false;const fn=this.listeners?.close;if(fn){delete this.listeners.close;fn()}}});
 const context={crypto,structuredClone,InvoiceCore:core,doc:structuredClone(draft),db:{documents:[]},cloud:{documents:[],deletedDocumentIds:[]},cloudReady:true,document:{createElement(){const d=node();dialogs.push(d);return d},body:{append(){}}},$:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},esc:v=>String(v??''),number:()=> 'INV-2026-AUTO',persist(){writes.push(structuredClone(context.db))},render(){},toast:s=>messages.push(s),refreshCloud:async()=>{},save(){},api:async(action,payload)=>{requests.push(structuredClone({action,...payload}));return context.respond(action,payload)},respond:async(action,payload)=>({document:{...payload.document,number:'INV-2026-TEST',revision:1,status:'confirmed'}})};
 vm.createContext(context);vm.runInContext(source,context);if(pending){context.testPending=pending;vm.runInContext('pendingDocumentSave=testPending',context)}return {context,nodes,dialogs,messages,writes,requests};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 // Existing browser drafts, including invalid ones, cannot replace a new invoice
 // or erase valid saved records. Only explicit Confirm caches a document.
 const app=fs.readFileSync(require.resolve('../src/app.js'),'utf8'),cached=fixture(),buttons=new Map(),nav=[{dataset:{page:'editor'}},{dataset:{page:'inventory'}}];
 let stored=JSON.stringify({version:1,business,documents:[cached],draft:{invalid:'old draft'},pendingDocumentSave:{operationId:'old request'}}),storageWrites=0,discard=false,prompts=0;
 const editor={InvoiceCore:core,crypto,structuredClone,validBackup:core.validBackup,localStorage:{getItem:()=>stored,setItem:(key,value)=>{stored=value;storageWrites++}},document:{querySelector:s=>{if(!buttons.has(s))buttons.set(s,{});return buttons.get(s)},querySelectorAll:()=>nav},preview(){},render(){},show(page){editor.page=page},window:{scrollTo(){}},confirm:()=>{prompts++;return discard}};
 vm.createContext(editor);vm.runInContext(app.slice(0,app.indexOf('function field(')),editor);editor.toast=()=>{};const read=expression=>vm.runInContext(expression,editor);
 assert.equal(read('doc.customer'),'');assert.notEqual(read('doc.id'),cached.id);assert.equal(read('db.documents.length'),1);assert.equal(read('db.draft'),undefined);
 read('persist()');assert.equal(JSON.parse(stored).draft,undefined);assert.equal(JSON.parse(stored).pendingDocumentSave,undefined);
 read("doc.customer='Unfinished customer';draft()");assert.equal(storageWrites,1);assert(!stored.includes('Unfinished customer'));
 vm.runInContext(app.slice(app.indexOf("$('#document-form').onsubmit="),app.indexOf("$('#search').oninput=")),editor);
 nav[0].onclick();assert.equal(read('doc.customer'),'Unfinished customer');assert.equal(prompts,1);discard=true;nav[0].onclick();assert.equal(read('doc.customer'),'');assert.equal(editor.page,'editor');assert.equal(read('db.documents.length'),1);
 read("doc.customer='Same-tab work'");nav[1].onclick();assert.equal(read('doc.customer'),'Same-tab work');assert.equal(editor.page,'inventory');
 editor.activeDocumentSave={};nav[0].onclick();assert.equal(read('doc.customer'),'Same-tab work');delete editor.activeDocumentSave;
 // A successful save must stay successful when only the subsequent list refresh fails.
 let h=harness();h.context.refreshCloud=async()=>{throw Error('List unavailable')};let result=await h.context.save('confirm');await tick();assert.equal(result.document.revision,1);assert.equal(h.context.doc.revision,1);assert.equal(h.context.db.pendingDocumentSave,undefined);assert.equal(h.writes.at(-1).documents[0].number,'INV-2026-TEST');assert.equal(h.writes.at(-1).draft,undefined);assert.match(h.nodes.get('#save-status').textContent,/Saved/);
 // An unknown outcome keeps the exact request in the same tab, without persisting it.
 h=harness();h.context.respond=async()=>{throw Error('Connection lost')};assert.equal(await h.context.save('confirm'),false);const pending=structuredClone(vm.runInContext('pendingDocumentSave',h.context)),draft=structuredClone(h.context.doc);assert.equal(h.context.db.pendingDocumentSave,undefined);h.context.respond=async(action,payload)=>({document:{...payload.document,number:'INV-2026-TEST',revision:1,status:'confirmed'}});result=await h.context.save('confirm');assert.equal(h.requests[1].operationId,pending.operationId);assert.deepEqual(h.requests[1].document,pending.document);assert.equal(result.document.status,'confirmed');
 // An edit after a failed request creates its own request; known rejection clears it.
 h=harness(draft,pending);h.context.doc.customer='Changed customer';h.context.respond=async()=>{throw Object.assign(Error('Invalid fields'),{status:400})};await h.context.save('confirm');assert.notEqual(h.requests[0].operationId,pending.operationId);assert.equal(vm.runInContext('pendingDocumentSave',h.context),null);
 // Concurrent taps share one request. Edits made while waiting survive locally;
 // the PDF receives only the content acknowledged by the server.
 h=harness();let release;h.context.respond=async(action,payload)=>{await new Promise(resolve=>{release=resolve});return {document:{...payload.document,revision:1,number:'INV-2026-TEST',status:'confirmed'}}};const first=h.context.save('confirm'),second=h.context.save('confirm');assert.equal(first,second);h.context.doc.customer='Edited while waiting';assert.equal(await h.context.save('confirm'),false);release();result=await first;assert.equal(h.requests.length,1);assert.equal(result.document.customer,'TEST customer');assert.equal(h.context.doc.customer,'Edited while waiting');assert.equal(h.context.doc.revision,1);
 // Changing the active document cannot replace it with the earlier save response.
 h=harness();h.context.respond=async(action,payload)=>{await new Promise(resolve=>{release=resolve});return {document:{...payload.document,revision:1,number:'INV-2026-TEST',status:'confirmed'}}};const saving=h.context.save('confirm'),other=fixture();h.context.doc=other;release();await saving;assert.equal(h.context.doc.id,other.id);assert.equal(h.context.db.draft,undefined);assert.notEqual(h.context.db.documents[0].id,other.id);
 // Genuine conflicts never overwrite or confirm different contents automatically.
 for(const choice of ['keep','open','new']){
  h=harness();const original=structuredClone(h.context.doc),latest={...original,revision:3,number:'INV-2026-OTHER',customer:'Saved customer',status:'confirmed'};h.context.respond=async()=>{throw Object.assign(Error('Conflict'),{status:409,code:'DOCUMENT_CONFLICT',currentDocument:latest})};const saving=h.context.save('confirm');await tick();assert.equal(h.dialogs[0].open,true);h.nodes.get('#conflict-'+choice).onclick();assert.equal(await saving,false);assert.equal(h.requests.length,1);
  if(choice==='keep')assert.deepEqual(h.context.doc,original);
  if(choice==='open')assert.equal(h.context.doc.revision,3);
  if(choice==='new'){assert.notEqual(h.context.doc.id,original.id);assert.equal(h.context.doc.customer,original.customer);assert.equal(h.context.doc.revision,undefined);assert.equal(h.context.doc.status,undefined)}
 }
 // Linked orders and receipts cannot accidentally become a separate sale.
 for(const link of ['orderId','sourceInvoice']){
  h=harness();h.context.doc[link]=crypto.randomUUID();h.context.respond=async()=>{throw Object.assign(Error('Conflict'),{status:409,code:'DOCUMENT_CONFLICT',currentDocument:{...h.context.doc,revision:2}})};const saving=h.context.save('confirm');await tick();assert(!h.dialogs[0].innerHTML.includes('id="conflict-new"'));h.nodes.get('#conflict-keep').onclick();await saving;
 }
 // The actual PDF handler must use the acknowledged snapshot, not the current editor.
 h=harness();h.context.navigator={};h.context.console=console;let exported;h.context.createDocumentPDF=d=>{exported=d;return {pdf:{},filename:'test.pdf'}};h.context.save=async()=>{const saved={...h.context.doc,customer:'Saved PDF',revision:1,status:'confirmed'};h.context.doc.customer='Unsaved editor changes';return {document:saved}};vm.runInContext(fs.readFileSync(require.resolve('../src/share.js'),'utf8'),h.context);await h.nodes.get('#save-doc').onclick();assert.equal(exported.customer,'Saved PDF');assert.equal(h.dialogs[1].open,true);
 console.log('Document save UI passed: refresh failures, in-memory retry IDs, no stored drafts, concurrent taps, edits and navigation during saves, conflict choices, linked-sale safety, and saved PDF snapshots.');
})().catch(error=>{console.error(error);process.exitCode=1});
