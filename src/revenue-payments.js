'use strict';
const revenuePaymentRequests=new Map();
let revenuePaymentBusy=false,revenuePaymentInvoice=null,revenuePaymentTrigger=null;
const revenuePaymentDialog=document.createElement('dialog');revenuePaymentDialog.id='revenue-payment-dialog';revenuePaymentDialog.className='revenue-payment-dialog';revenuePaymentDialog.setAttribute('aria-labelledby','revenue-payment-title');
revenuePaymentDialog.innerHTML='<h2 id="revenue-payment-title">Mark invoice as paid?</h2><p id="revenue-payment-name"></p><p id="revenue-payment-number"></p><div class="revenue-payment-balance"><span>Remaining balance</span><strong id="revenue-payment-amount"></strong></div><p id="revenue-payment-error" role="alert" hidden></p><div class="revenue-payment-actions"><button type="button" class="secondary" id="revenue-payment-close">Cancel</button><button type="button" class="primary" id="revenue-payment-confirm">Mark as paid</button></div>';
document.body.append(revenuePaymentDialog);
function openRevenuePayment(id){
 if(revenuePaymentBusy||revenuePaymentDialog.open)return;
 if(typeof activeDocumentSave!=='undefined'&&activeDocumentSave)return toast('A document is being saved. Please wait.');
 const invoice=cloud.documents.find(d=>d.id===id&&d.type==='invoice'&&d.status==='confirmed');
 if(!invoice)return toast('Refresh Revenue to see the latest invoice.');
 const balance=InvoiceCore.invoicePayments(invoice,cloud.documents,cloud.payments||[]).balance;
 if(!balance){renderRevenue();return toast('This invoice is already paid.')}
 revenuePaymentInvoice=structuredClone(invoice);revenuePaymentTrigger=document.activeElement;
 $('#revenue-payment-name').textContent=invoice.customer;$('#revenue-payment-number').textContent=invoice.number;
 $('#revenue-payment-amount').textContent=revenueMoney(revenuePaymentRequests.get(id)?.expectedBalance||balance,invoice.currency);
 $('#revenue-payment-error').hidden=true;$('#revenue-payment-confirm').textContent=revenuePaymentRequests.has(id)?'Retry payment':'Mark as paid';
 revenuePaymentDialog.showModal();$('#revenue-payment-close').focus();
}
async function confirmRevenuePayment(){
 if(revenuePaymentBusy||!revenuePaymentInvoice)return;
 const invoice=revenuePaymentInvoice;
 const payload=revenuePaymentRequests.get(invoice.id)||{id:invoice.id,revision:invoice.revision,expectedBalance:InvoiceCore.invoicePayments(invoice,cloud.documents,cloud.payments||[]).balance,operationId:crypto.randomUUID()};
 revenuePaymentRequests.set(invoice.id,payload);revenuePaymentBusy=true;
 $('#revenue-payment-confirm').disabled=$('#revenue-payment-close').disabled=true;$('#revenue-payment-confirm').textContent='Saving…';$('#revenue-payment-error').hidden=true;
 try{
  const result=await api('mark-paid',payload);
  if(result.document?.id!==invoice.id||!Array.isArray(result.payments)||!Array.isArray(result.receipts))throw Error('Could not verify the payment. Retry to check the same payment.');
  const wasUnedited=doc.id===invoice.id&&InvoiceCore.sameDocumentContent(doc,invoice);
  cacheSavedDocument(result.document);for(const receipt of result.receipts)cacheSavedDocument(receipt);
  cloud.payments=[...(cloud.payments||[]).filter(p=>p.invoice_id!==invoice.id),...result.payments];
  if(wasUnedited)doc=structuredClone(result.document);
  revenuePaymentRequests.delete(invoice.id);persist();render();renderRevenue();revenuePaymentDialog.close();
  const remaining=InvoiceCore.invoicePayments(result.document,cloud.documents,cloud.payments).balance;
  toast(remaining?'Payment saved. Current balance: '+revenueMoney(remaining,result.document.currency):result.alreadyPaid?'This invoice is already paid.':'Invoice marked as paid.');
  try{await refreshCloud();renderRevenue()}catch{$('#revenue-message').textContent='Payment saved. Refresh to update the rest of the workspace.'}
 }catch(error){
  if(error.status&&error.status<500)revenuePaymentRequests.delete(invoice.id);
  if(error.status===409||error.status===404){revenuePaymentDialog.close();toast(error.message);await loadRevenue()}
  else{$('#revenue-payment-error').textContent=error.message||'Could not verify the payment. Retry to check the same payment.';$('#revenue-payment-error').hidden=false;$('#revenue-payment-confirm').textContent='Retry payment'}
 }finally{revenuePaymentBusy=false;$('#revenue-payment-confirm').disabled=$('#revenue-payment-close').disabled=false;if(revenuePaymentDialog.open)$('#revenue-payment-confirm').textContent=revenuePaymentRequests.has(invoice.id)?'Retry payment':'Mark as paid'}
}
$('#revenue-payment-confirm').onclick=confirmRevenuePayment;
$('#revenue-payment-close').onclick=()=>{if(!revenuePaymentBusy)revenuePaymentDialog.close()};
revenuePaymentDialog.addEventListener('cancel',event=>{if(revenuePaymentBusy)event.preventDefault()});
revenuePaymentDialog.addEventListener('close',()=>{revenuePaymentInvoice=null;if(revenuePaymentTrigger?.isConnected)revenuePaymentTrigger.focus({preventScroll:true});else if(!$('#revenue').hidden)$('#revenue-tab-outstanding').focus({preventScroll:true})});
