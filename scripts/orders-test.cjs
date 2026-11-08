// Integration tests use isolated TEST products/documents and clean up all records.
require('../lib/config.cjs');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),orders=require('../lib/orders.cjs'),inventory=require('../lib/inventory.cjs'),db=require('../lib/database.cjs')();
const ids={products:[],documents:[],orders:[],submissions:[],operations:[]};
process.env.TURNSTILE_SITE_KEY='mock-production-site-key';process.env.TURNSTILE_SECRET_KEY='mock-production-private-key';process.env.TURNSTILE_HOSTNAMES='orders-test.example';
const originalFetch=global.fetch;global.fetch=async url=>{if(url!=='https://challenges.cloudflare.com/turnstile/v0/siteverify')throw Error('Unexpected fetch in integration test');return Response.json({success:true,hostname:'orders-test.example',action:'public_order'})};
const submit=input=>orders.submit({...input,turnstileToken:'mock-challenge-token'},{hostname:'orders-test.example',ip:'127.0.0.1'});
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=';
const business={name:'TEST ONLY',address:'',email:'',phone:'',registration:'',payment:'',terms:'',currency:'MYR',logo:''};
const ip='orders-test-'+crypto.randomUUID();
const limitKey='submit:'+crypto.createHmac('sha256',process.env.ORDER_RATE_SECRET||process.env.DATABASE_URL).update(ip).digest('hex');
(async()=>{
 let user;
 const mutate=(action,input)=>{const operationId=crypto.randomUUID();ids.operations.push(operationId);return inventory.mutate(action,{...input,operationId},user)};
 async function seedDocument(order,qty=2){
  const id=crypto.randomUUID(),number='TEST-ORDER-'+id;ids.documents.push(id);
  const doc={id,revision:1,status:'draft',type:'invoice',number,date:'2026-11-08',due:'',paymentDate:'2026-11-08',currency:'MYR',business,customer:'TEST order',address:'',email:'',reference:order.reference,method:'Bank transfer',paymentReference:'',notes:'',terms:'',payment:'',items:[{productId:ids.products[0],description:'TEST public product',qty,price:20}],discount:0,discountType:'fixed',tax:0,shipping:0,paid:0,orderId:order.id,orderRevision:order.revision};
  await db`insert into larz.documents(id,number,status,data,created_by) values(${id},${number},'draft',${db.json(doc)},${user.id})`;
  return doc;
 }
 try{
  [user]=await db`select user_id as id from larz.members limit 1`;assert(user,'A workspace member is required');
  for(const isPublic of [true,false]){const id=crypto.randomUUID();ids.products.push(id);await mutate('product',{product:{id,name:isPublic?'TEST public product':'TEST private product',sku:'ORDER-TEST-'+id,stock:5,low_stock:1,price_myr:20,price_usd:5,active:true,public_order:isPublic,image}})}
  const catalog=await orders.catalog();assert(catalog.products.some(p=>p.id===ids.products[0]));assert(!catalog.products.some(p=>p.id===ids.products[1]));const publicProduct=catalog.products.find(p=>p.id===ids.products[0]);assert(publicProduct.image);for(const key of ['stock','sku','low_stock','price_usd','revision'])assert(!(key in publicProduct));
  const input={submissionId:crypto.randomUUID(),business:'TEST customer',phone:'+60 12 345 6789',email:'',delivery:'pickup',address:{street:'',postcode:'',city:'',state:'',country:''},items:[{productId:ids.products[0],qty:2}],website:'',token:catalog.token};ids.submissions.push(input.submissionId);
  assert.throws(()=>orders.validateSubmission({...input,items:[{...input.items[0],qty:-1}]}));assert.throws(()=>orders.validateSubmission({...input,price:0}));assert.throws(()=>orders.validateSubmission({...input,delivery:'delivery'}));assert.throws(()=>orders.validateSubmission({...input,email:'bad'}));assert.throws(()=>orders.validateSubmission({...input,items:[input.items[0],input.items[0]]}));assert(!orders.validToken(input.token.replace(/.$/,'x')));
  await new Promise(resolve=>setTimeout(resolve,1100));
  const first=await submit(input),again=await submit(input);assert.equal(first.reference,again.reference);
  let [order]=await db`select * from larz.orders where submission_id=${input.submissionId}`;ids.orders.push(order.id);assert.equal(order.status,'pending');assert.equal(order.data.total,4000+Math.round(2*catalog.setupRate*100));assert.equal((await db`select stock from larz.products where id=${ids.products[0]}`)[0].stock,5);
  await assert.rejects(()=>submit({...input,business:'Different customer'}));
  const publicSecretAttempt={...input,submissionId:crypto.randomUUID(),items:[{productId:ids.products[1],qty:1}]};await assert.rejects(()=>submit(publicSecretAttempt));
  const invoice=await seedDocument(order),other=await seedDocument(order);
  const outcomes=await Promise.allSettled([mutate('confirm',{document:invoice}),mutate('confirm',{document:other})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const saved=outcomes.find(r=>r.status==='fulfilled').value.document;
  assert.equal((await db`select stock from larz.products where id=${ids.products[0]}`)[0].stock,3);
  [order]=await db`select * from larz.orders where id=${order.id}`;assert.equal(order.status,'approved');assert.equal(order.document_id,saved.id);assert.equal((await db`select order_id from larz.documents where id=${saved.id}`)[0].order_id,order.id);
  await mutate('confirm',{document:saved});assert.equal((await db`select stock from larz.products where id=${ids.products[0]}`)[0].stock,3);await assert.rejects(()=>mutate('reject-order',{id:order.id,revision:order.revision}));
  const second={...input,submissionId:crypto.randomUUID()};ids.submissions.push(second.submissionId);await submit(second);const [pending]=await db`select * from larz.orders where submission_id=${second.submissionId}`;ids.orders.push(pending.id);
  await mutate('stock',{id:ids.products[0],delta:-3,reason:'TEST insufficient-stock check'});
  const insufficient=await seedDocument(pending);await assert.rejects(()=>mutate('confirm',{document:insufficient}));assert.equal((await db`select status from larz.orders where id=${pending.id}`)[0].status,'pending');assert.equal((await db`select status from larz.documents where id=${insufficient.id}`)[0].status,'draft');
  await mutate('reject-order',{id:pending.id,revision:pending.revision});await assert.rejects(()=>mutate('confirm',{document:insufficient}));assert.equal((await db`select stock from larz.products where id=${ids.products[0]}`)[0].stock,0);
  const list=await orders.list(new URLSearchParams({status:'approved',q:order.reference}));assert.equal(list.orders.length,1);assert.equal(list.orders[0].document_id,saved.id);
  for(let i=0;i<20;i++)await orders.rateLimit(ip);await assert.rejects(()=>orders.rateLimit(ip),error=>error.status===429);
  console.log('Orders integration passed: public images/privacy, validation, authoritative pricing, retry deduplication, pending stock, concurrent approval, repeat confirmation, insufficient-stock rollback, rejection, document link and distributed rate limits.');
 }finally{
  if(ids.orders.length)await db`update larz.orders set document_id=null where id in ${db(ids.orders)}`;
  if(ids.products.length)await db`delete from larz.stock_movements where product_id in ${db(ids.products)}`;
  if(ids.documents.length)await db`delete from larz.documents where id in ${db(ids.documents)}`;
  if(ids.submissions.length)await db`delete from larz.orders where submission_id in ${db(ids.submissions)}`;
  if(ids.products.length)await db`delete from larz.products where id in ${db(ids.products)}`;
  if(ids.operations.length)await db`delete from larz.operations where id in ${db(ids.operations)}`;
  await db`delete from larz.order_limits where key=${limitKey}`;
  await db.end();global.fetch=originalFetch;
 }
})().catch(error=>{console.error('Orders integration failed:',error.code||error.message);process.exitCode=1});
