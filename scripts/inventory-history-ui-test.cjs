const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const elements=new Map(),requests=[];
function element(selector){if(!elements.has(selector))elements.set(selector,{value:selector==='#product-filter'?'all':'',hidden:false,innerHTML:'',textContent:'',handlers:{},setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn},querySelector(){return null},querySelectorAll(){return []}});return elements.get(selector)}
const products=[{id:'first',name:'Same name',sku:'A',stock:10,low_stock:2,active:true,price_myr:10,price_usd:3},{id:'second',name:'Same name',sku:'B',stock:1,low_stock:2,active:true,price_myr:10,price_usd:3}];
const context={document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},$:element,cloud:{products},esc:value=>String(value??''),api:route=>new Promise((resolve,reject)=>requests.push({route,resolve,reject})),URLSearchParams,structuredClone,crypto:require('node:crypto')};context.window=context;
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/inventory.js'),'utf8'),context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=reason=>({movements:[{delta:1,reason,created_at:'2026-11-13T10:00:00Z'}],page:1,total:1,limit:5});
(async()=>{
 context.inventoryView();assert.equal(requests.length,1);assert(requests[0].route.includes('product=first'));
 context.focusInventoryProduct('second');assert.equal(requests.length,2);assert(requests[1].route.includes('product=second'));
 requests[1].resolve(response('Second product history'));await tick();assert(element('#product-movement-list').innerHTML.includes('Second product history'));
 requests[0].resolve(response('Stale first product history'));await tick();assert(!element('#product-movement-list').innerHTML.includes('Stale first product history'));
 context.inventoryView();requests[2].reject(Error('History connection interrupted'));await tick();assert(element('#product-movement-list').innerHTML.includes('data-retry-movements'));
 const retry={dataset:{},hasAttribute:name=>name==='data-retry-movements'};element('#inventory').handlers.click({target:{closest:()=>retry}});assert.equal(requests.length,4);requests[3].resolve({movements:[],page:1,total:0,limit:5});await tick();assert(element('#product-movement-list').innerHTML.includes('No stock movements for this product'));
 element('#product-search').value='Unmatched product';element('#product-search').oninput();assert.equal(requests.length,4);assert(element('#inventory-detail').innerHTML.includes('Select a product'));assert(element('#inventory-list').innerHTML.includes('No products match'));
 console.log('Inventory history UI passed: product ID requests, stale-response protection, single refresh request, retry recovery, empty history and unmatched-product safety.');
})().catch(error=>{console.error(error);process.exitCode=1});
