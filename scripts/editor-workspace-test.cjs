const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),core=require('../src/core.js');
const source=fs.readFileSync(require.resolve('../src/editor.js'),'utf8');
// Calendar Reset may commit through change/blur without an input event. The
// draft must retain an empty date so a later render cannot restore stale data.
{
 const app=fs.readFileSync(require.resolve('../src/app.js'),'utf8'),listeners=new Map(),snapshots=[];
 const form={addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)}};
 const dateContext={doc:{date:'2026-11-15',due:'2026-12-01',paymentDate:'2026-11-15',customer:'Unchanged customer'},db:{documents:[]},$:()=>form,draft(){snapshots.push({...dateContext.doc})}};
 vm.createContext(dateContext);vm.runInContext(app.slice(app.indexOf("$('#document-form').addEventListener('input',"),app.indexOf("$('#document-form').addEventListener('click',")),dateContext);
 const fire=(type,target)=>{for(const listener of listeners.get(type)||[])listener({target})};
 for(const name of ['date','due','paymentDate']){
  for(const event of ['input','change','focusout']){
   dateContext.doc[name]='2026-11-15';const field={name,type:'date',value:'',dataset:{}};
   fire(event,field);assert.equal(dateContext.doc[name],'');assert.equal(snapshots.at(-1)[name],'');
   const updates=snapshots.length;fire('change',field);fire('focusout',field);assert.equal(snapshots.length,updates);
   field.value='2026-12-02';fire('change',field);assert.equal(dateContext.doc[name],'2026-12-02');
  }
 }
 const updates=snapshots.length;for(const extra of [{disabled:true},{readOnly:true}])fire('change',{name:'date',type:'date',value:'',dataset:{},...extra});assert.equal(snapshots.length,updates);assert.equal(dateContext.doc.customer,'Unchanged customer');
 const invoice={number:'INV-TEST',type:'invoice',currency:'MYR',customer:'TEST customer',date:'2026-11-15',due:'',items:[{description:'Product',qty:1,price:10}],discount:0,discountType:'fixed',tax:0,shipping:0,paid:0};
 assert.equal(core.validate(invoice).length,0);assert(core.validate({...invoice,date:''}).length);assert(core.validate({...invoice,type:'receipt',paymentDate:'',paid:10}).length);
}
const business={name:'TEST business'},product={id:'test-product',name:'TEST card',sku:'TEST',stock:9,price_myr:99};
const item={productId:product.id,description:product.name,price:20,qty:2};
const holder={children:[],querySelector(selector){if(selector==='select')return this.select;return this.children.find(node=>selector.split(',').some(part=>part==='.'+node.className))||null},append(node){this.children.push(node)},prepend(node){this.children.unshift(node)},select:{options:[{value:product.id,textContent:''}]}};
const form={querySelectorAll:selector=>selector===':scope > .form-section'?[]:selector==='.product-choice'?[holder]:[]},total={textContent:''},profile={addEventListener(){}},details={dataset:{editorDetail:'charges'},open:true};
let refreshed=0;
const context={InvoiceCore:core,doc:{id:'one',type:'invoice',currency:'MYR',business,items:[item],discountType:'fixed',discount:0,tax:0,shipping:5,paid:0},cloud:{products:[product]},document:{querySelectorAll:()=>[details],createElement:()=>({setAttribute(){}})},$:selector=>selector==='#document-form'?form:selector==='#editor-business-profile'?profile:selector==='#editor-total'?total:null,money:value=>'RM '+(value/100).toFixed(2),render(){},preview(){},refreshCloud:async()=>{refreshed++;product.stock=7;product.price_myr=150},show(){},esc:value=>String(value)};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 context.updateEditorProductInfo();assert.equal(holder.children.length,2);assert.match(holder.children[1].textContent,/RM 20.00 each · 9 available/);context.updateEditorProductInfo();assert.equal(holder.children.length,2);
 await context.refreshCloud();assert.equal(refreshed,1);assert.match(holder.children[1].textContent,/RM 20.00 each · 7 available/);assert.match(holder.select.options[0].textContent,/7 available/);assert.equal(item.price,20);assert.equal(item.qty,2);
 context.preview();assert.equal(total.textContent,'RM 45.00');item.qty=3;context.doc.shipping=7.5;context.preview();assert.equal(total.textContent,'RM 67.50');
 context.rememberEditorDetails();const replacement={dataset:{},open:false};context.restoreEditorDetail(replacement,'charges');assert(replacement.open);context.doc.id='two';context.rememberEditorDetails();const fresh={dataset:{},open:false};context.restoreEditorDetail(fresh,'charges');assert.equal(fresh.open,false);
 const auth=require('../lib/auth.cjs');auth.user=async req=>req.headers.cookie==='test-session'?{id:'test'}:null;const server=require('../server.cjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;for(const file of ['/src/editor.js','/src/editor.css']){assert.equal((await fetch(base+file,{redirect:'manual'})).status,303);assert.equal((await fetch(base+file,{headers:{cookie:'test-session'}})).status,200)}}finally{await new Promise(resolve=>server.close(resolve))}
 console.log('Split editor passed: calendar clearing via input/change/blur, required date validation, live totals, refreshed availability, quoted-price preservation, same-document disclosure state, fresh-document reset and private assets.');
})().catch(error=>{console.error(error);process.exitCode=1});
