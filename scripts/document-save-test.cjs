const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),core=require('../src/core.js');
const source=fs.readFileSync(require.resolve('../src/document-save.js'),'utf8');
const business={name:'TEST workspace',address:'',email:'',phone:'',registration:'',payment:'',terms:'',currency:'MYR',logo:''};
const fixture=()=>({id:crypto.randomUUID(),number:'INV-2026-AUTO',type:'invoice',date:'2026-11-13',due:'',currency:'MYR',customer:'TEST customer',address:'',email:'',reference:'',items:[{productId:crypto.randomUUID(),description:'TEST product',qty:1,price:10}],discount:0,discountType:'fixed',tax:0,shipping:0,shippingCost:0,paid:0,paymentDate:'2026-11-13',method:'Cash',paymentReference:'',notes:'',terms:'',payment:'',business});
function harness(draft=fixture(),pending){
 const nodes=new Map(),dialogs=[],messages=[],writes=[],requests=[];
 const node=()=>({disabled:false,setAttribute(){},addEventListener(type,fn){this.listeners??={};this.listeners[type]=fn},showModal(){this.open=true},close(){this.open=false;const fn=this.listeners?.close;if(fn){delete this.listeners.close;fn()}}});
 const context={crypto,structuredClone,InvoiceCore:core,doc:structuredClone(draft),db:{draft:structuredClone(draft),documents:[],pendingDocumentSave:pending},cloud:{documents:[],deletedDocumentIds:[]},cloudReady:true,document:{createElement(){const d=node();dialogs.push(d);return d},body:{append(){}}},$:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},esc:v=>String(v??''),number:()=> 'INV-2026-AUTO',persist(){writes.push(structuredClone(context.db))},render(){},toast:s=>messages.push(s),refreshCloud:async()=>{},save(){},api:async(action,payload)=>{requests.push(structuredClone({action,...payload}));return context.respond(action,payload)},respond:async(action,payload)=>({document:{...payload.document,number:'INV-2026-TEST',revision:1,status:'confirmed'}})};
 vm.createContext(context);vm.runInContext(source,context);return {context,nodes,dialogs,messages,writes,requests};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 // A successful save must stay successful when only the subsequent list refresh fails.
 let h=harness();h.context.refreshCloud=async()=>{throw Error('List unavailable')};let result=await h.context.save('confirm');await tick();assert.equal(result.document.revision,1);assert.equal(h.context.db.draft.revision,1);assert.equal(h.context.db.pendingDocumentSave,undefined);assert.equal(h.writes.at(-1).draft.number,'INV-2026-TEST');assert.match(h.nodes.get('#save-status').textContent,/Saved/);
 // An unknown outcome keeps the exact request across retries and browser reloads.
 h=harness();h.context.respond=async()=>{throw Error('Connection lost')};assert.equal(await h.context.save('confirm'),false);const pending=structuredClone(h.context.db.pendingDocumentSave),draft=structuredClone(h.context.doc);h=harness(draft,pending);result=await h.context.save('confirm');assert.equal(h.requests[0].operationId,pending.operationId);assert.deepEqual(h.requests[0].document,pending.document);assert.equal(result.document.status,'confirmed');
 // An edit after a failed request creates its own request; known rejection clears it.
 h=harness(draft,pending);h.context.doc.customer='Changed customer';h.context.respond=async()=>{throw Object.assign(Error('Invalid fields'),{status:400})};await h.context.save('confirm');assert.notEqual(h.requests[0].operationId,pending.operationId);assert.equal(h.context.db.pendingDocumentSave,undefined);
 // Concurrent taps share one request. Edits made while waiting survive locally;
 // the PDF receives only the content acknowledged by the server.
 h=harness();let release;h.context.respond=async(action,payload)=>{await new Promise(resolve=>{release=resolve});return {document:{...payload.document,revision:1,number:'INV-2026-TEST',status:'confirmed'}}};const first=h.context.save('confirm'),second=h.context.save('confirm');assert.equal(first,second);h.context.doc.customer='Edited while waiting';assert.equal(await h.context.save('confirm'),false);release();result=await first;assert.equal(h.requests.length,1);assert.equal(result.document.customer,'TEST customer');assert.equal(h.context.doc.customer,'Edited while waiting');assert.equal(h.context.db.draft.revision,1);
 // Changing the active document cannot replace it with the earlier save response.
 h=harness();h.context.respond=async(action,payload)=>{await new Promise(resolve=>{release=resolve});return {document:{...payload.document,revision:1,number:'INV-2026-TEST',status:'confirmed'}}};const saving=h.context.save('confirm'),other=fixture();h.context.doc=other;release();await saving;assert.equal(h.context.db.draft.id,other.id);assert.notEqual(h.context.db.documents[0].id,other.id);
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
 console.log('Document save UI passed: refresh failures, persistent retry IDs, reload recovery, concurrent taps, edits and navigation during saves, conflict choices, linked-sale safety, and saved PDF snapshots.');
})().catch(error=>{console.error(error);process.exitCode=1});
