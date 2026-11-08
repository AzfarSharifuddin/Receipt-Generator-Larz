const crypto=require('node:crypto'),database=require('./database.cjs'),core=require('../src/core.js');
const turnstile=require('./turnstile.cjs');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const secret=()=>process.env.ORDER_RATE_SECRET||process.env.DATABASE_URL||fail('Order form is not configured.',503);
const sign=value=>crypto.createHmac('sha256',secret()).update(value).digest('hex');
function issueToken(){const value=Date.now()+'.'+crypto.randomBytes(16).toString('hex');return value+'.'+sign(value)}
function validToken(token){
 if(typeof token!=='string'||token.length>180)return false;
 const match=/^(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);if(!match)return false;
 const age=Date.now()-Number(match[1]);
 return age>=1000&&age<7200000&&crypto.timingSafeEqual(Buffer.from(match[3],'hex'),Buffer.from(sign(match[1]+'.'+match[2]),'hex'));
}
async function rateLimit(ip,scope='submit'){
 const sql=database(),key=scope+':'+sign(String(ip)),max=scope==='catalog'?120:20;
 const [limit]=await sql`insert into larz.order_limits(key,count,expires_at) values(${key},1,now()+interval '15 minutes') on conflict(key) do update set count=case when larz.order_limits.expires_at<now() then 1 else larz.order_limits.count+1 end,expires_at=case when larz.order_limits.expires_at<now() then now()+interval '15 minutes' else larz.order_limits.expires_at end returning count`;
 if(limit.count>max)fail('Too many requests. Please try again in 15 minutes.',429);
 // Expired addresses are not retained indefinitely.
 await sql`delete from larz.order_limits where expires_at<now()-interval '1 day'`;
}
const setupRate=settings=>{const value=settings?.setupChargeMyr??2.5;return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e6?value:2.5};
async function catalog(context={}){
 const sql=database();
 const products=await sql`select id,name,price_myr,image,(stock>0) as available from larz.products where public_order=true and active=true and deleted_at is null order by name`;
 const [settings]=await sql`select data from larz.settings where id=1`;
 return {products:products.map(p=>({id:p.id,name:p.name,price:Number(p.price_myr),image:core.validImage(p.image)?p.image:'',available:p.available})),setupRate:setupRate(settings?.data),token:issueToken(),turnstile:turnstile.publicConfig(context.hostname)};
}
function validateSubmission(input){
 const allowed=['submissionId','business','phone','email','delivery','address','items','token','website','turnstileToken'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))fail('Invalid order fields.');
 if(!uuid(input.submissionId)||!text(input.business,200)||!input.business.trim())fail('Enter your business or invoice name.');
 if(!text(input.phone,40)||!/^\+?[\d ()-]{7,35}$/.test(input.phone)||input.phone.replace(/\D/g,'').length<7)fail('Enter a valid WhatsApp or phone number.');
 if(!text(input.email,254)||(input.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)))fail('Enter a valid email address or leave it blank.');
 if(!['delivery','pickup'].includes(input.delivery))fail('Choose delivery or self-collection.');
 const address=input.address;
 if(!address||typeof address!=='object'||Array.isArray(address)||Object.keys(address).some(k=>!['street','postcode','city','state','country'].includes(k)))fail('Check the delivery address.');
 for(const key of ['street','postcode','city','state','country'])if(!text(address[key],key==='street'?500:100)||(input.delivery==='delivery'&&!address[key].trim()))fail('Complete your delivery address.');
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>30)fail('Select at least one product (maximum 30 products).');
 if(input.items.some(i=>!i||Object.keys(i).some(k=>!['productId','qty'].includes(k))||!uuid(i.productId)||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>1000)||new Set(input.items.map(i=>i.productId)).size!==input.items.length||input.items.reduce((s,i)=>s+i.qty,0)>10000)fail('Check product quantities (1–1,000 each; maximum 10,000 pieces).');
 return {business:input.business.trim(),phone:input.phone.trim(),email:input.email.trim(),delivery:input.delivery,address:Object.fromEntries(Object.entries(address).map(([k,v])=>[k,input.delivery==='pickup'?'':v.trim()])),items:input.items.map(i=>({productId:i.productId,qty:i.qty})).sort((a,b)=>a.productId.localeCompare(b.productId))};
}
async function submit(input,context={}){
 if(input?.website!==''||!validToken(input?.token))fail('Please refresh the order form and try again.');
 const data=validateSubmission(input),hash=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
 await turnstile.verify(input.turnstileToken,{...context,submissionId:input.submissionId});
 const sql=database();
 return sql.begin(async tx=>{
  // Serialise only retries of this submission, without blocking other customers.
  await tx`select pg_advisory_xact_lock(hashtextextended(${input.submissionId},0))`;
  const [old]=await tx`select reference,payload_hash from larz.orders where submission_id=${input.submissionId}`;
  if(old){if(old.payload_hash!==hash)fail('This submission was already received. Refresh before making another order.',409);return {reference:old.reference}}
  const products=await tx`select id,name,price_myr,stock from larz.products where id in ${tx(data.items.map(i=>i.productId))} and public_order=true and active=true and deleted_at is null for share`;
  data.items=data.items.map(item=>{const product=products.find(p=>p.id===item.productId);if(!product)fail('A selected product is no longer available. Refresh the form.');if(product.stock<item.qty)fail(product.name+' is not available in that quantity. Please reduce the quantity.');return {...item,description:product.name,price:Number(product.price_myr)}});
  const [settings]=await tx`select data from larz.settings where id=1`;
  data.setupRate=setupRate(settings?.data);data.currency='MYR';
  const pieces=data.items.reduce((s,i)=>s+i.qty,0),subtotal=data.items.reduce((s,i)=>s+core.round(i.price*i.qty),0),setup=core.round(pieces*data.setupRate);
  data.subtotal=subtotal;data.setup=setup;data.total=subtotal+setup;
  if(![subtotal,setup,data.total].every(Number.isSafeInteger))fail('Order total is too large.');
  const reference='ORD-'+crypto.randomBytes(6).toString('hex').toUpperCase();
  await tx`insert into larz.orders(id,submission_id,payload_hash,reference,data) values(${crypto.randomUUID()},${input.submissionId},${hash},${reference},${tx.json(data)})`;
  return {reference};
 });
}
async function list(params){
 if(params.get('summary')==='1'){const [count]=await database()`select count(*)::int as pending from larz.orders where status='pending'`;return count}
 const sql=database(),status=params.get('status')||'pending',q=(params.get('q')||'').trim(),page=Number(params.get('page')||1);
 if(!['pending','approved','rejected'].includes(status)||q.length>200||!Number.isSafeInteger(page)||page<1||page>100000)fail('Invalid order filter.');
 const search='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
 return sql.begin(async tx=>{
  await tx`set transaction isolation level repeatable read read only`;
  const rows=await tx`select o.*,d.number as document_number,d.status as document_status,d.deleted_at as document_deleted from larz.orders o left join larz.documents d on d.id=o.document_id where o.status=${status} and (o.reference ilike ${search} or o.data->>'business' ilike ${search} or o.data->>'phone' ilike ${search}) order by o.created_at desc,o.id limit 30 offset ${(page-1)*30}`;
  const [count]=await tx`select count(*)::int as total from larz.orders where status=${status} and (reference ilike ${search} or data->>'business' ilike ${search} or data->>'phone' ilike ${search})`;
  const [pending]=await tx`select count(*)::int as total from larz.orders where status='pending'`;
  return {orders:rows,total:count.total,pending:pending.total,page};
 });
}
async function reject(tx,input,user){
 if(!uuid(input.id)||!Number.isInteger(input.revision))fail('Invalid order.');
 const [order]=await tx`select * from larz.orders where id=${input.id} for update`;
 if(!order||order.status!=='pending'||order.revision!==input.revision)fail('This order was already processed. Refresh the list.',409);
 await tx`update larz.orders set status='rejected',revision=revision+1,processed_at=now(),processed_by=${user.id} where id=${order.id}`;
}
async function checkApproval(tx,d,old,action){
 const orderId=old?.order_id||d.orderId;
 if(old?.order_id&&d.orderId!==old.order_id)fail('The source order cannot be changed.');
 if(!orderId)return null;
 if(!uuid(orderId)||d.sourceInvoice||d.type!=='invoice'||d.currency!=='MYR')fail('Customer orders must create an RM invoice.');
 const [order]=await tx`select * from larz.orders where id=${orderId} for update`;
 if(!order||order.status==='rejected')fail('The source order is no longer pending.',409);
 if(order.status==='approved'){if(order.document_id!==d.id)fail('This order already has an invoice. Open the existing invoice.',409)}
 else if(action!=='confirm'||order.revision!==d.orderRevision)fail('The order changed. Reopen it from Pending Order.',409);
 return order;
}
async function approve(tx,order,documentId,user){
 if(order?.status==='pending')await tx`update larz.orders set status='approved',document_id=${documentId},revision=revision+1,processed_at=now(),processed_by=${user.id} where id=${order.id}`;
}
module.exports={catalog,submit,list,reject,checkApproval,approve,rateLimit,validateSubmission,validToken,issueToken};
