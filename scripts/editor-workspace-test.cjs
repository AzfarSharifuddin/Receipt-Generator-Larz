const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),core=require('../src/core.js');
const source=fs.readFileSync(require.resolve('../src/editor.js'),'utf8');
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
 console.log('Split editor passed: live totals, refreshed availability, quoted-price preservation, same-document disclosure state, fresh-document reset and private assets.');
})().catch(error=>{console.error(error);process.exitCode=1});
