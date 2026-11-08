'use strict';
const orderRM=value=>'RM '+(value/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
let orderStatus='pending',orderPage=1,orderRows=[],orderTotal=0,orderRequest=0;
function orderBadge(count){const badge=$('#orders-badge');badge.hidden=!count;badge.textContent=count;badge.setAttribute('aria-label',count+' pending orders')}
async function loadOrders(){
 const request=++orderRequest;
 $('#orders-message').textContent='Loading orders…';
 try{
  const data=await api('orders?'+new URLSearchParams({status:orderStatus,q:$('#orders-search').value.trim(),page:orderPage}));
  if(request!==orderRequest)return;
  orderRows=data.orders;orderTotal=data.total;orderBadge(data.pending);
  if(!orderRows.length&&orderPage>1){orderPage--;return loadOrders()}
  $('#orders-message').textContent=data.total+' '+orderStatus+' '+(data.total===1?'order':'orders');
  $('#orders-list').innerHTML=orderRows.length?orderRows.map(order=>`<article class="saved-row order-row"><div class="order-row-details"><div class="order-row-meta"><span class="order-reference-small">${esc(order.reference)}</span><time datetime="${esc(order.created_at)}">${esc(new Date(order.created_at).toLocaleString('en-MY',{dateStyle:'medium',timeStyle:'short'}))}</time></div><strong>${esc(order.data.business)}</strong><small>${esc(order.data.phone)} · ${order.data.delivery==='pickup'?'Self-collection':'Delivery'} · ${order.data.items.reduce((sum,item)=>sum+item.qty,0)} pcs</small><p class="order-item-names">${order.data.items.map(item=>`${esc(item.description)} × ${item.qty}`).join(' · ')}</p></div><div class="order-row-end"><strong>${orderRM(order.data.total)}</strong><small>Submitted estimate</small><div class="saved-actions"><button type="button" class="${order.status==='pending'?'primary':'secondary'}" data-review-order="${order.id}">${order.status==='pending'?'Review':'View details'}</button>${order.status==='pending'?`<button type="button" class="danger" data-reject-order="${order.id}">Reject</button>`:''}</div></div></article>`).join(''):`<div class="empty orders-empty"><strong>No ${esc(orderStatus)} orders${$('#orders-search').value?' found':''}.</strong><p>${orderStatus==='pending'?'Customer submissions will appear here for review.':''}</p>${orderStatus==='pending'?'<a href="/order" target="_blank" rel="noopener">Open the customer form ↗</a>':''}</div>`;
  $('#orders-page').textContent=orderTotal?'Page '+orderPage+' of '+Math.ceil(orderTotal/30):'';
  $('#orders-prev').disabled=orderPage===1;$('#orders-next').disabled=orderPage*30>=orderTotal;
 }catch(error){if(request===orderRequest)$('#orders-message').textContent=error.message||'Could not load orders. Use Refresh to try again.'}
}
const reviewOrderDialog=document.createElement('dialog');reviewOrderDialog.className='order-review-dialog';reviewOrderDialog.setAttribute('aria-labelledby','review-order-title');document.body.append(reviewOrderDialog);
const sourceOrderBanner=document.createElement('div');sourceOrderBanner.id='source-order-banner';sourceOrderBanner.className='source-order-banner';sourceOrderBanner.hidden=true;$('#document-form').parentElement.before(sourceOrderBanner);
function orderAddress(data){return data.delivery==='pickup'?'Self-collection':[data.address.street,[data.address.postcode,data.address.city].filter(Boolean).join(' '),data.address.state,data.address.country].filter(Boolean).join('\n')}
async function reviewOrder(id){
 const old=orderRows.find(row=>row.id===id);if(!old)return;
 try{
  await refreshCloud();
  const current=await api('orders?'+new URLSearchParams({status:old.status,q:old.reference})),order=current.orders.find(row=>row.id===id);
  if(!order){toast('This order was processed by another employee. The list has been refreshed.');return loadOrders()}
  const changes=[],stockWarnings=[];
  for(const item of order.data.items){const product=cloud.products.find(p=>p.id===item.productId);if(!product||!product.active)stockWarnings.push(item.description+' is no longer available.');else if(product.stock<item.qty)stockWarnings.push(item.description+': '+product.stock+' available, '+item.qty+' ordered.');if(product&&InvoiceCore.round(product.price_myr)!==InvoiceCore.round(item.price))changes.push(item.description+': '+orderRM(InvoiceCore.round(item.price))+' → '+orderRM(InvoiceCore.round(product.price_myr)))}
  if(chargeRate('MYR')!==order.data.setupRate)changes.push('Setup charge per piece: '+orderRM(InvoiceCore.round(order.data.setupRate))+' → '+orderRM(InvoiceCore.round(chargeRate('MYR'))));
  reviewOrderDialog.innerHTML=`<div class="order-review-heading"><div><span class="order-reference-small">${esc(order.reference)}</span><h2 id="review-order-title">${esc(order.data.business)}</h2></div><button type="button" id="close-review-order" class="secondary" aria-label="Close order details">Close</button></div><div class="order-contact-grid"><div><span class="caption">CUSTOMER</span><p>${esc(order.data.phone)}${order.data.email?'<br>'+esc(order.data.email):''}</p></div><div><span class="caption">${order.data.delivery==='pickup'?'SELF-COLLECTION':'DELIVERY ADDRESS'}</span><p class="address">${esc(orderAddress(order.data))}</p></div></div><div class="order-review-items">${order.data.items.map(item=>{const image=cloud.products.find(p=>p.id===item.productId)?.image;return `<div>${image?`<img class="product-thumb" src="${esc(image)}" alt="${esc(item.description)}">`:''}<span>${esc(item.description)}<small>${item.qty} × ${orderRM(InvoiceCore.round(item.price))}</small></span><strong>${orderRM(InvoiceCore.round(item.qty*item.price))}</strong></div>`}).join('')}</div><div class="order-review-total"><span>Setup charge (${order.data.items.reduce((s,i)=>s+i.qty,0)} pcs)</span><span>${orderRM(order.data.setup)}</span></div><div class="order-review-total"><strong>Submitted estimate</strong><strong>${orderRM(order.data.total)}</strong></div>${order.data.delivery==='delivery'?'<p class="orders-message">Shipping cost is added during invoice review.</p>':''}${stockWarnings.length?`<div class="order-warning" role="status">${stockWarnings.map(esc).join('<br>')}<br>Adjust the items before confirming the invoice.</div>`:''}${changes.length?`<div class="order-price-changes"><strong>Prices have changed since submission</strong><p>${changes.map(esc).join('<br>')}</p>${order.status==='pending'?'<label><input type="checkbox" id="order-current-prices"> Use current prices and setup rate on the invoice</label>':''}</div>`:''}<div class="order-review-actions">${order.status==='pending'?'<p>Review the prefilled invoice, then Confirm to approve this order and deduct stock.</p><button id="order-create-invoice" type="button" class="primary">Create invoice</button>':order.document_id?`<p>${order.document_deleted?'The linked document was deleted.':esc(order.document_number)+' · '+esc(order.document_status)}</p>${order.document_deleted?'':'<button id="order-open-invoice" type="button" class="primary">Open invoice</button>'}`:'<p>This order was rejected.</p>'}</div>`;
  $('#close-review-order').onclick=()=>reviewOrderDialog.close();
  if($('#order-create-invoice'))$('#order-create-invoice').onclick=()=>{
   if(!confirm('Open the prefilled invoice? This replaces the current unfinished document.'))return;
   const currentPrices=$('#order-current-prices')?.checked;
   doc=fresh('invoice');doc.currency='MYR';doc.customer=order.data.business;doc.email=order.data.email;doc.address=[order.data.delivery==='pickup'?'':orderAddress(order.data),'Phone: '+order.data.phone].filter(Boolean).join('\n');doc.reference=order.reference;
   doc.items=order.data.items.map(item=>({...item,price:currentPrices?(cloud.products.find(p=>p.id===item.productId)?.price_myr??item.price):item.price}));
   doc.setupChargeRate=currentPrices?chargeRate('MYR'):order.data.setupRate;doc.orderId=order.id;doc.orderRevision=order.revision;doc.orderDelivery=order.data.delivery;syncSetupCharge();reviewOrderDialog.close();render();draft();show('editor');window.scrollTo({top:0,behavior:'smooth'});
  };
  if($('#order-open-invoice'))$('#order-open-invoice').onclick=()=>{const invoice=db.documents.find(d=>d.id===order.document_id);if(!invoice)return toast('Invoice unavailable. Refresh the workspace.');if(!confirm('Open the invoice? This replaces the current unfinished document.'))return;doc=structuredClone(invoice);reviewOrderDialog.close();render();draft();show('editor')};
  reviewOrderDialog.showModal();
 }catch(error){toast(error.message)}
}
$('#orders-list').onclick=async event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.reviewOrder)return reviewOrder(button.dataset.reviewOrder);
 const order=orderRows.find(row=>row.id===button.dataset.rejectOrder);if(!order||!confirm('Reject '+order.reference+' from '+order.data.business+'? Stock will not change.'))return;
 button.disabled=true;
 try{await operation('reject-order',{id:order.id,revision:order.revision});await loadOrders()}
 catch(error){toast(error.message);button.disabled=false}
};
document.querySelectorAll('[data-order-status]').forEach(button=>button.onclick=()=>{orderStatus=button.dataset.orderStatus;orderPage=1;document.querySelectorAll('[data-order-status]').forEach(item=>item.classList.toggle('active',item===button));loadOrders()});
$('#orders-prev').onclick=()=>{orderPage--;loadOrders()};$('#orders-next').onclick=()=>{orderPage++;loadOrders()};
$('#refresh-orders').onclick=loadOrders;
$('#orders-search').oninput=()=>{clearTimeout(loadOrders.searchTimer);loadOrders.searchTimer=setTimeout(()=>{orderPage=1;loadOrders()},300)};
$('#copy-order-link').onclick=async()=>{const link=new URL('/order',location.origin).href;try{await navigator.clipboard.writeText(link);toast('Order form link copied.')}catch{prompt('Copy this order form link:',link)}};
const showBeforeOrders=show;show=function(page){showBeforeOrders(page);if(page==='orders'){$('#page-title').textContent='Pending Order';loadOrders()}};
const renderBeforeOrders=render;render=function(){renderBeforeOrders();sourceOrderBanner.hidden=!doc.orderId;sourceOrderBanner.textContent=doc.orderId?'Order '+doc.reference+(doc.status==='confirmed'?' · Approved':doc.orderDelivery==='delivery'?' · Check shipping cost, then Confirm to approve.':' · Confirm to approve and deduct stock.'):'';if(doc.orderId){$('#currency').disabled=true;$('#receipt-mode').disabled=true}else $('#receipt-mode').disabled=false};
const modeBeforeOrders=mode;mode=function(type){if(doc.orderId&&type!=='invoice')return toast('Customer orders create invoices. Use New document to create a manual receipt.');modeBeforeOrders(type)};
async function refreshOrderInbox(){if(document.visibilityState!=='visible'||!cloudReady||reviewOrderDialog.open)return;try{if(!$('#orders').hidden)await loadOrders();else orderBadge((await api('orders?summary=1')).pending)}catch{}}
setInterval(refreshOrderInbox,30000);document.addEventListener('visibilitychange',refreshOrderInbox);window.addEventListener('focus',refreshOrderInbox);
const saveBeforeOrders=save;save=async function(action){const result=await saveBeforeOrders(action);if(result)refreshOrderInbox();return result};
refreshCloud().then(refreshOrderInbox).catch(()=>{});
