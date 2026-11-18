// Live SQL verification inside one rolled-back transaction. No real invoices,
// payment records, stock quantities or document counters are changed.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),database=require('../lib/database.cjs'),core=require('../src/core.js'),revenue=require('../src/revenue.js'),payments=require('../lib/payments.cjs');
const db=database(),databaseModule=require.cache[require.resolve('../lib/database.cjs')],rollback=Error('ROLLBACK_PAYMENT_TEST');
(async()=>{
 try{
  await db.begin(async tx=>{
   const [member]=await tx`select user_id from larz.members limit 1`;assert(member,'An existing workspace member is required for this rollback-only test.');const user={id:member.user_id};
   databaseModule.exports=()=>({begin:fn=>tx.savepoint(fn)});delete require.cache[require.resolve('../lib/inventory.cjs')];const inventory=require('../lib/inventory.cjs');
   const product=crypto.randomUUID(),id=crypto.randomUUID(),receiptId=crypto.randomUUID(),otherId=crypto.randomUUID(),draftId=crypto.randomUUID();
   await tx`insert into larz.products(id,name,sku,price_myr,price_usd,stock) values(${product},'Rollback payment test',${'TEST-PAY-'+product},100,25,10)`;
   const business={name:'TEST business',address:'',email:'',phone:'',registration:'',terms:'',payment:'',currency:'MYR',logo:''};
   const invoice={id,number:'TEST-PAY-'+id,type:'invoice',currency:'MYR',customer:'TEST customer',date:'2026-09-01',due:'',address:'',email:'',reference:'',items:[{productId:product,description:'TEST product',qty:1,price:100}],discount:0,discountType:'fixed',tax:0,shipping:0,shippingCost:0,paid:20,paymentDate:'2026-09-01',method:'Cash',paymentReference:'',notes:'',terms:'',payment:'',business,revision:1,status:'confirmed'};
   const receipt={...invoice,id:receiptId,number:'TEST-PAY-'+receiptId,type:'receipt',sourceInvoice:id,paid:30,paymentDate:'2026-09-02'};
   for(const d of [invoice,receipt,{...invoice,id:otherId,number:'TEST-PAY-'+otherId,paid:0},{...invoice,id:draftId,number:'TEST-PAY-'+draftId,status:'draft'}])await tx`insert into larz.documents(id,number,status,data,source_invoice,created_by) values(${d.id},${d.number},${d.status},${tx.json(d)},${d.sourceInvoice||null},${user.id})`;
   const payload={id,revision:1,expectedBalance:5000,operationId:crypto.randomUUID()};
   let result=await inventory.mutate('mark-paid',payload,user);
   assert.equal(result.document.paid,20);assert.equal(result.document.paymentDate,'2026-09-01');assert.equal(result.payment.amount_cents,5000);assert.equal(result.document.recordedPaid,80);assert.equal(core.displayTotals(result.document).balance,0);
   const retried=await inventory.mutate('mark-paid',payload,user);assert(retried.recovered);assert.equal(retried.payment.id,result.payment.id);
   const colleague=await inventory.mutate('mark-paid',{...payload,operationId:crypto.randomUUID()},user);assert(colleague.alreadyPaid);assert.equal(colleague.payments.length,1);
   assert.equal(Number((await tx`select count(*) from larz.invoice_payments where invoice_id=${id}`)[0].count),1);
   assert.equal(Number((await tx`select count(*) from larz.operations where id=${payload.operationId}`)[0].count),1);
   await assert.rejects(()=>inventory.mutate('mark-paid',{...payload,expectedBalance:1},user),error=>error.status===409);
   await assert.rejects(()=>inventory.mutate('mark-paid',{id:otherId,revision:1,expectedBalance:9999,operationId:crypto.randomUUID()},user),error=>error.status===409);
   for(const patch of [{id:draftId},{id:receiptId},{revision:0},{expectedBalance:0},{expectedBalance:1.1}])await assert.rejects(()=>inventory.mutate('mark-paid',{...payload,operationId:crypto.randomUUID(),...patch},user));
   await assert.rejects(()=>inventory.mutate('document',{document:{...result.document,currency:'USD'},operationId:crypto.randomUUID()},user),/Currency cannot change/);
   const saved=await inventory.mutate('confirm',{document:result.document,operationId:crypto.randomUUID()},user);assert.equal(core.displayTotals(saved.document).balance,0);assert.equal(saved.document.recordedPaid,80);
   result=await inventory.mutate('mark-paid',payload,user);assert.equal(result.document.revision,saved.document.revision);assert.equal(result.payments.length,1);
   const report=revenue.report([result.document,...result.receipts],result.payment.paid_on,result.payment.paid_on,'MYR',result.payments);
   assert.equal(report.collected,5000);assert.equal(report.outstandingTotal,0);assert.equal(report.collections.length,1);
   assert.equal(Number((await tx`select stock from larz.products where id=${product}`)[0].stock),10);
   assert.equal(Number((await tx`select count(*) from larz.stock_movements where product_id=${product}`)[0].count),0);
   const [stored]=await tx`select data from larz.documents where id=${id}`;assert.equal(stored.data.recordedPaid,undefined);
   throw rollback;
  });
 }catch(error){if(error!==rollback)throw error}
 finally{databaseModule.exports=database;await db.end()}
 console.log('Payment SQL passed (rolled back): remaining balance, partial/receipt history, retries, colleague duplicate clicks, stale requests, read-only records, currency protection, PDF balance and unchanged stock/counters.');
})().catch(error=>{console.error('Payment SQL test failed:',error.code==='ERR_ASSERTION'?error.stack:error.code||error.message);process.exitCode=1});
