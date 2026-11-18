const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync(require.resolve('../order.html'),'utf8');
const source=fs.readFileSync(require.resolve('../order.js'),'utf8');
const elements=new Map(),cards=new Map();let focused=null,posts=[],fail=true;
function element(id=''){
 const listeners={};return {id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,validity:{valid:true},dataset:{},listeners,
  classList:{toggle(){}},addEventListener(name,fn){listeners[name]=fn},focus(){focused=this},scrollIntoView(){},setCustomValidity(message){this.message=message},reportValidity(){return !this.message},matches(selector){return selector.startsWith('input')},append(){},showModal(){this.open=true},close(){this.open=false;listeners.close?.()},querySelector(selector){return this.children?.get(selector)||null},querySelectorAll(){return []}};
}
for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set('#'+id,element(id));
elements.set('.page-heading',element());const delivery=element();delivery.value='delivery';elements.set('input[name="delivery"]:checked',delivery);
elements.get('#country').value='Malaysia';
const names=['<img src=x onerror=bad()>','Other product'];
const products=names.map((name,i)=>({id:crypto.randomUUID(),name,price:i?20:25,available:!i,image:''}));
for(const product of products){const card=element();card.children=new Map(['input','.qty-counter','.add-product','[data-adjust="1"]'].map(key=>[key,element()]));card.dataset.product=product.id;cards.set(product.id,card)}
const form=elements.get('#order-form');
const inputs=['business','phone','email','street','postcode','city','state','country','website'].map(key=>elements.get('#'+key));
form.querySelectorAll=()=>[...inputs,...products.flatMap(p=>[...cards.get(p.id).children.values()]),...['submit-order','review-order','verification-retry'].map(id=>elements.get('#'+id))];
form.checkValidity=()=>['business','phone',...(delivery.value==='delivery'?['street','postcode','city','state','country']:[])].every(key=>elements.get('#'+key).value&&!elements.get('#'+key).message);
form.reportValidity=()=>form.checkValidity();
let verification;
class Verification{constructor(options){this.options=options;this.token='';this.siteKey='';verification=this}configure(){this.siteKey='sample';this.options.onChange()}reset(){this.token='';this.options.onChange()}destroy(){this.token=''}complete(){this.token='sample-response';this.options.onChange()}}
const document={querySelector(selector){if(elements.has(selector))return elements.get(selector);const match=/^\[data-product="([^"]+)"\](?: (.*))?$/.exec(selector);if(match)return match[2]?cards.get(match[1]).querySelector(match[2]):cards.get(match[1]);const add=/^\[data-add="([^"]+)"\]$/.exec(selector);if(add)return cards.get(add[1]).querySelector('.add-product');throw Error('Unexpected selector '+selector)},querySelectorAll(){return []},addEventListener(){},createElement(){return element()},body:element()};
const window={matchMedia:()=>({matches:true}),scrollTo(){},innerHeight:800};
const context=vm.createContext({document,window,crypto,OrderVerification:Verification,AbortSignal,console,setTimeout,fetch:async(url,options)=>{
 if(url==='/api/public/catalog')return {ok:true,json:async()=>({products,setupRate:2.5,token:(Date.now()-2000)+'.sample',turnstile:{ready:true}})};
 posts.push(JSON.parse(options.body));if(fail)return {ok:false,status:503,json:async()=>({error:'Uncertain'})};return {ok:true,status:200,json:async()=>({reference:'ORD-TEST'})};
}});
const run=code=>vm.runInContext(code,context),tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 vm.runInContext(source,context);await tick();
 assert.ok(elements.get('#products').innerHTML.includes('&lt;img'));assert.ok(!elements.get('#products').innerHTML.includes('<img src=x'));
 assert.equal(elements.get('#review-order').disabled,true);
 run(`setQuantity('${products[0].id}',2)`);assert.equal(elements.get('#bar-total').textContent,'RM 55.00');assert.equal(elements.get('#builder-setup-total').textContent,'RM 5.00');assert.equal(verification.siteKey,'');
 run(`setQuantity('${products[1].id}',1)`);assert.equal(elements.get('#bar-total').textContent,'RM 55.00');
 run('reviewOrder()');assert.equal(elements.get('#customer-details').open,true);assert.equal(elements.get('#order-review').hidden,true);
 assert.equal(run('reviewing'),false);
 for(const [key,value] of Object.entries({business:'Cafe <test>',phone:'+60123456789',street:'10 Test Road',postcode:'71800',city:'Nilai',state:'Negeri Sembilan'}))elements.get('#'+key).value=value;
 run('reviewOrder()');assert.equal(run('reviewing'),true);assert.equal(elements.get('#order-builder').hidden,true);assert.ok(elements.get('#review-customer').innerHTML.includes('Cafe &lt;test&gt;'));assert.equal(elements.get('#submit-order').disabled,true);
 verification.complete();assert.equal(elements.get('#submit-order').disabled,false);
 run("editOrder('business')");assert.equal(elements.get('#business').value,'Cafe <test>');assert.equal(elements.get('#street').value,'10 Test Road');assert.equal(run('reviewing'),false);
 delivery.value='pickup';form.listeners.change({target:{name:'delivery',value:'pickup'}});assert.equal(elements.get('#address-fields').disabled,true);
 run('reviewOrder()');assert.ok(elements.get('#review-customer').innerHTML.includes('Self-collection'));assert.ok(!elements.get('#review-customer').innerHTML.includes('10 Test Road'));
 await form.listeners.submit({preventDefault(){}});assert.equal(posts.length,1);assert.equal(elements.get('#submit-order').textContent,'Retry submission');assert.equal(elements.get('#business').disabled,true);assert.equal(elements.get('#verification-retry').disabled,false);
 run("editOrder('business')");assert.equal(run('reviewing'),true);run(`setQuantity('${products[0].id}',3)`);assert.equal(elements.get('#bar-total').textContent,'RM 55.00');
 verification.complete();fail=false;await form.listeners.submit({preventDefault(){}});assert.equal(posts.length,2);assert.equal(posts[0].submissionId,posts[1].submissionId);assert.deepEqual(posts[0].items,posts[1].items);assert.equal(posts[1].items[0].qty,2);assert.equal(elements.get('#order-reference').textContent,'ORD-TEST');assert.equal(form.hidden,true);
 console.log('Compact order form passed: escaped content, live totals, availability, disclosure validation, retained edits/address, pickup, verification gate, locked uncertain retry and one submission ID.');
})().catch(error=>{console.error(error);process.exitCode=1});
