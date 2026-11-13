require('../lib/config.cjs');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),inventory=require('../lib/inventory.cjs'),sql=require('../lib/database.cjs')();
const ids=[crypto.randomUUID(),crypto.randomUUID()],created=[];
(async()=>{
 try{
  await sql.begin(async tx=>{
   for(const id of ids){await tx`insert into larz.products(id,name,sku,price_myr,price_usd,stock,low_stock,active) values(${id},'TEST movement history',${'TEST-HISTORY-'+id},10,3,0,1,true)`;created.push(id)}
   const rows=Array.from({length:45},(_,i)=>({product_id:ids[0],delta:i%2===0?1:-1,reason:'TEST history '+i,operation_id:crypto.randomUUID(),created_at:new Date(Date.UTC(2026,0,1,0,i)).toISOString()}));
   rows.push({product_id:ids[1],delta:1,reason:'TEST other product',operation_id:crypto.randomUUID(),created_at:new Date().toISOString()});
   await tx`insert into larz.stock_movements ${tx(rows,'product_id','delta','reason','operation_id','created_at')}`;
  });
  const query=(extra='')=>inventory.movements(new URLSearchParams('product='+ids[0]+extra));
  const pages=await Promise.all(Array.from({length:9},(_,i)=>query('&page='+(i+1)))),first=pages[0];assert.equal(first.total,45);assert(pages.every(page=>page.movements.length===5));assert.equal(new Set(pages.flatMap(page=>page.movements).map(m=>m.id)).size,45);assert(first.movements.every(m=>m.product_id===ids[0]&&m.sku==='TEST-HISTORY-'+ids[0]));assert.equal(first.movements[0].reason,'TEST history 44');
  const added=await query('&direction=in'),removed=await query('&direction=out');assert.equal(added.total,23);assert.equal(removed.total,22);assert(added.movements.every(m=>m.delta>0));assert(removed.movements.every(m=>m.delta<0));assert.equal((await query('&page=999999')).page,9);
  await sql`update larz.products set deleted_at=now(),active=false where id=${ids[0]}`;assert.equal((await query()).total,45);
  const other=await inventory.movements(new URLSearchParams('product='+ids[1]));assert.equal(other.total,1);assert.equal(other.movements[0].reason,'TEST other product');
  console.log('Movement history integration passed: exact product IDs, same-name isolation, stable pagination, directional totals, page clamping and retained deleted-product history.');
 }finally{if(created.length){await sql`delete from larz.stock_movements where product_id in ${sql(created)}`;await sql`delete from larz.products where id in ${sql(created)}`}await sql.end()}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
