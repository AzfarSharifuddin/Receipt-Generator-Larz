const core=require('../src/core.js');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const receipt=row=>({...row.data,id:row.id,number:row.number,status:row.status,revision:row.revision,sourceInvoice:row.source_invoice});
const payment=row=>({...row,amount_cents:Number(row.amount_cents)});
function paymentDate(now=new Date()){const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`}
async function all(tx){return (await tx`select id,invoice_id,amount_cents,currency,paid_on::text as paid_on from larz.invoice_payments order by created_at,id`).map(payment)}
async function related(tx,id){
 const receipts=(await tx`select * from larz.documents where source_invoice=${id} and status='confirmed' and deleted_at is null`).map(receipt);
 const payments=(await tx`select id,invoice_id,amount_cents,currency,paid_on::text as paid_on from larz.invoice_payments where invoice_id=${id} order by created_at,id`).map(payment);
 return {receipts,payments};
}
function decorate(documents,payments){return documents.map(d=>{const received=d.type==='invoice'?core.invoicePayments(d,documents,payments):{linked:0,recorded:0};return {...d,recordedPaid:(received.linked+received.recorded)/100}})}
async function decorateOne(tx,d){if(d.type!=='invoice')return {...d,recordedPaid:0};const data=await related(tx,d.id);const amounts=core.invoicePayments(d,data.receipts,data.payments);return {...d,recordedPaid:(amounts.linked+amounts.recorded)/100}}
async function hasPayments(tx,id){return !!(await tx`select id from larz.invoice_payments where invoice_id=${id} limit 1`)[0]}
async function markPaid(tx,input,user){
 if(!uuid(input.id)||!Number.isSafeInteger(input.revision)||input.revision<1||!Number.isSafeInteger(input.expectedBalance)||input.expectedBalance<=0)fail('Invalid invoice payment request.');
 const [row]=await tx`select * from larz.documents where id=${input.id} for update`;
 if(!row||row.deleted_at)fail('Invoice no longer exists.',404);
 if(row.status!=='confirmed'||row.data.type!=='invoice'||row.source_invoice)fail('Only confirmed invoices can be marked as paid.');
 const data=await related(tx,row.id),amounts=core.invoicePayments({...row.data,id:row.id},data.receipts,data.payments);
 if(!amounts.balance)return {row,...data,alreadyPaid:true};
 if(row.revision!==input.revision||input.expectedBalance!==amounts.balance)fail('Invoice or payments changed. Refresh Revenue and review the remaining balance.',409);
 const [saved]=await tx`insert into larz.invoice_payments(id,invoice_id,amount_cents,currency,paid_on,actor) values(${input.operationId},${row.id},${amounts.balance},${row.data.currency},${paymentDate()},${user.id}) returning id,invoice_id,amount_cents,currency,paid_on::text as paid_on`;
 const [updated]=await tx`update larz.documents set revision=revision+1,updated_at=now() where id=${row.id} returning *`;
 return {row:updated,receipts:data.receipts,payments:[...data.payments,payment(saved)],payment:payment(saved),alreadyPaid:false};
}
module.exports={all,decorate,decorateOne,hasPayments,markPaid,paymentDate,relatedForReplay:related};
