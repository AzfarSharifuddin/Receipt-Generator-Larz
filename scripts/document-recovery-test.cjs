require('../lib/config.cjs');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),inventory=require('../lib/inventory.cjs'),core=require('../src/core.js'),db=require('../lib/database.cjs')();
const productId=crypto.randomUUID(),documents=[],operations=[];
const business={name:'TEST recovery',address:'',email:'',phone:'',registration:'',payment:'',terms:'',currency:'MYR',logo:''};
(async()=>{let user;const mutate=(action,payload,operationId=crypto.randomUUID())=>{if(!operations.includes(operationId))operations.push(operationId);return inventory.mutate(action,{...payload,operationId},user)};
 const seed=async qty=>{const id=crypto.randomUUID(),number='TEST-RECOVERY-'+id;documents.push(id);const document={id,number,revision:1,status:'draft',type:'invoice',date:'2026-11-13',due:'',paymentDate:'2026-11-13',currency:'MYR',business,customer:'TEST recovery',address:'',email:'',reference:'',method:'Cash',paymentReference:'',notes:'',terms:'',payment:'',items:[{productId,description:'TEST recovery product',qty,price:10}],discount:0,discountType:'fixed',tax:0,shipping:0,paid:0};await db`insert into larz.documents(id,number,status,data,created_by) values(${id},${number},'draft',${db.json(document)},${user.id})`;return document};
 const stock=async()=>(await db`select stock from larz.products where id=${productId}`)[0].stock;
 const conflict=error=>error.status===409&&error.publicCode==='DOCUMENT_CONFLICT'&&!!error.currentDocument;
 try{
  [user]=await db`select user_id as id from larz.members limit 1`;assert(user,'A workspace member is required');
  await mutate('product',{product:{id:productId,name:'TEST recovery product',sku:'RECOVERY-'+productId,price_myr:10,price_usd:3,stock:10,low_stock:1,active:true}});
  const original=await seed(2),operationId=crypto.randomUUID(),first=await mutate('confirm',{document:original},operationId);assert.equal(await stock(),8);
  const replay=await mutate('confirm',{document:original},operationId);assert.equal(replay.document.revision,first.document.revision);assert.equal(await stock(),8);
  const noRevision={...original,number:'INV-2026-AUTO'};delete noRevision.revision;delete noRevision.status;
  const recovered=await mutate('confirm',{document:noRevision});assert(recovered.recovered);assert.equal(recovered.document.number,original.number);assert.equal(recovered.document.revision,first.document.revision);assert.equal(await stock(),8);
  await assert.rejects(()=>mutate('confirm',{document:{...noRevision,customer:'Different sale'}}),conflict);assert.equal(await stock(),8);
  await assert.rejects(()=>mutate('cancel',{document:original}),conflict);
  const updated=(await mutate('confirm',{document:{...first.document,items:[{...first.document.items[0],qty:3}]}})).document;assert.equal(await stock(),7);
  await assert.rejects(()=>mutate('confirm',{document:original},operationId),conflict);assert.equal(await stock(),7);
  const latestRecovery=await mutate('confirm',{document:{...updated,revision:1}});assert(latestRecovery.recovered);assert.equal(latestRecovery.document.revision,updated.revision);assert.equal(await stock(),7);
  const matchingDraft=await seed(1),missing={...matchingDraft,number:'INV-2026-AUTO'};delete missing.revision;delete missing.status;
  const draftConfirmed=await mutate('confirm',{document:missing});assert.equal(draftConfirmed.document.status,'confirmed');assert.equal(await stock(),6);await mutate('confirm',{document:missing});assert.equal(await stock(),6);
  const concurrent=await seed(1),results=await Promise.all([mutate('confirm',{document:concurrent}),mutate('confirm',{document:concurrent})]);assert.equal(results[0].document.revision,results[1].document.revision);assert.equal(await stock(),5);assert.equal((await db`select count(*)::int as count from larz.stock_movements where document_id=${concurrent.id}`)[0].count,1);
  assert(core.sameDocumentContent(updated,{...updated,number:'AUTO',revision:0,status:'draft',updatedAt:'old'}));assert(!core.sameDocumentContent(updated,{...updated,items:[{...updated.items[0],qty:4}]}));assert(!core.sameDocumentContent(updated,{...updated,sourceInvoice:crypto.randomUUID()}));
  assert.equal((await db`select count(*)::int as count from larz.stock_movements where document_id=${original.id}`)[0].count,2);
  console.log('Document recovery passed: lost acknowledgements, stale metadata recovery, saved numbers, no duplicate stock changes, real conflicts, stale cancellation rejection, cached replay after edits, and confirmation of matching drafts.');
 }finally{
  await db`delete from larz.stock_movements where product_id=${productId}`;
  if(documents.length)await db`delete from larz.documents where id in ${db(documents)}`;
  await db`delete from larz.products where id=${productId}`;
  if(operations.length)await db`delete from larz.operations where id in ${db(operations)}`;
  await db.end();
 }
})().catch(error=>{console.error('Recovery integration failed:',error.code||error.message);process.exitCode=1});
