'use strict';
const orderRM=value=>'RM '+(value/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
let orderStatus='pending',orderPage=1,orderRows=[],orderTotal=0,orderRequest=0,orderReviewRequest=0;
let expandedOrderId=null,expandedOrder=null,orderReviewError='',orderReviewLoading=false,autoExpandOrder=true,orderActionBusy=false;
const currentOrderPrices=new Map();
const rejectOrderDialog=$('#reject-order-dialog');let rejectOrderRequest=null,rejectOrderBusy=false;
const sourceOrderBanner=document.createElement('div');sourceOrderBanner.id='source-order-banner';sourceOrderBanner.className='source-order-banner';sourceOrderBanner.hidden=true;$('#document-form').parentElement.before(sourceOrderBanner);
function orderBadge(count){const badge=$('#orders-badge');badge.hidden=!count;badge.textContent=count;badge.setAttribute('aria-label',count+' pending '+(count===1?'order':'orders'))}
function orderAddress(data){return data.delivery==='pickup'?'Self-collection':[data.address.street,[data.address.postcode,data.address.city].filter(Boolean).join(' '),data.address.state,data.address.country].filter(Boolean).join('\n')}
function orderPieces(order){return order.data.items.reduce((sum,item)=>sum+item.qty,0)}
function orderPhoto(item,preview=false){const product=cloud.products.find(p=>p.id===item.productId);return product?.image?`<img class="product-thumb ${preview?'order-mini-photo':''}" src="${esc(product.image)}" alt="${esc(item.description)}" loading="lazy">`:`<span class="order-photo-placeholder ${preview?'order-mini-photo':''}" aria-label="No image for ${esc(item.description)}">${preview?'—':'No image'}</span>`}
function orderChecks(order){
 const changes=[],warnings=[];if(order.status!=='pending')return {changes,warnings};
 for(const item of order.data.items){const product=cloud.products.find(p=>p.id===item.productId);if(!product||!product.active)warnings.push(item.description+' is no longer available.');else if(product.stock<item.qty)warnings.push(item.description+': '+product.stock+' available, '+item.qty+' ordered.');if(product&&InvoiceCore.round(product.price_myr)!==InvoiceCore.round(item.price))changes.push(item.description+': '+orderRM(InvoiceCore.round(item.price))+' → '+orderRM(InvoiceCore.round(product.price_myr)))}
 if(chargeRate('MYR')!==order.data.setupRate)changes.push('Setup charge per piece: '+orderRM(InvoiceCore.round(order.data.setupRate))+' → '+orderRM(InvoiceCore.round(chargeRate('MYR'))));
 return {changes,warnings};
}
function orderReviewContent(order){
 const {changes,warnings}=orderChecks(order),pieces=orderPieces(order);
 return `<div class="order-expanded-body"><div class="order-contact-grid"><div><span class="order-field-label">Customer</span><p>${esc(order.data.phone)}${order.data.email?'<br>'+esc(order.data.email):''}</p></div><div><span class="order-field-label">${order.data.delivery==='pickup'?'Self-collection':'Delivery address'}</span><p class="address">${esc(orderAddress(order.data))}</p></div></div><div class="order-review-items">${order.data.items.map(item=>{const product=cloud.products.find(p=>p.id===item.productId);return `<div>${orderPhoto(item)}<span><strong class="order-review-item-name">${esc(item.description)}</strong><small>${item.qty} × ${orderRM(InvoiceCore.round(item.price))}</small>${order.status==='pending'?`<small class="order-stock-availability ${!product?.active||product.stock<item.qty?'order-stock-short':''}">${!product?.active?'Unavailable for new sales':product.stock+' available'}</small>`:''}</span><strong>${orderRM(InvoiceCore.round(item.qty*item.price))}</strong></div>`}).join('')}</div><div class="order-review-totals"><div><span>Items subtotal</span><span>${orderRM(order.data.subtotal??order.data.items.reduce((sum,item)=>sum+InvoiceCore.round(item.qty*item.price),0))}</span></div><div><span>Setup charge (${pieces} pcs × ${orderRM(InvoiceCore.round(order.data.setupRate))})</span><span>${orderRM(order.data.setup)}</span></div><div class="order-estimate-total"><strong>Submitted estimate</strong><strong>${orderRM(order.data.total)}</strong></div></div>${order.data.delivery==='delivery'?'<p class="order-shipping-note">Shipping cost is added in the invoice.</p>':''}${warnings.length?`<div class="order-warning" role="status">${warnings.map(esc).join('<br>')}<br>Adjust the items before confirming the invoice.</div>`:''}${changes.length?`<div class="order-price-changes"><strong>Prices changed since submission</strong><p>${changes.map(esc).join('<br>')}</p><label><input type="checkbox" id="order-current-prices" ${currentOrderPrices.get(order.id)?'checked':''}> Use current prices and setup rate on the invoice</label></div>`:''}</div><div class="order-review-actions">${order.status==='pending'?`<p>Approval and stock deduction happen when you Confirm the invoice.</p><div class="order-review-buttons"><button type="button" class="order-reject-action" data-reject-order="${esc(order.id)}">Reject order</button><button id="order-create-invoice" type="button" class="primary" data-create-order-invoice="${esc(order.id)}" ${orderActionBusy?'disabled':''}>Create invoice</button></div>`:order.document_id?`<p>${order.document_deleted?'The linked document was deleted.':esc(order.document_number)+' · '+esc(order.document_status)}</p>${order.document_deleted?'':`<button id="order-open-invoice" type="button" class="primary" data-open-order-invoice="${esc(order.id)}" ${orderActionBusy?'disabled':''}>Open invoice</button>`}`:'<p>This order was rejected. Stock was not deducted.</p>'}</div>`;
}
function renderOrderList(){
 const statusNames={pending:'Pending',approved:'Approved',rejected:'Rejected'};
 $('#orders-list').innerHTML=orderRows.length?orderRows.map(order=>{
  const open=expandedOrderId===order.id,ready=open&&expandedOrder?.id===order.id;
  return `<article class="order-card ${open?'order-card-expanded':''}"><div class="order-card-heading"><div class="order-card-information"><strong class="order-business">${esc(order.data.business)}</strong><div class="order-card-meta"><span class="order-reference-small">${esc(order.reference)}</span><time datetime="${esc(order.created_at)}">${esc(new Date(order.created_at).toLocaleString('en-MY',{dateStyle:'medium',timeStyle:'short'}))}</time><span class="order-fulfilment">${order.data.delivery==='pickup'?'Self-collection':'Delivery'}</span><span class="order-status order-status-${esc(order.status)}">${statusNames[order.status]||'Order'}</span></div><div class="order-card-products">${order.data.items.slice(0,3).map(item=>orderPhoto(item,true)).join('')}<span>${orderPieces(order)} pieces · ${order.data.items.length} ${order.data.items.length===1?'product':'products'}</span></div></div><div class="order-card-end"><div class="order-card-price"><strong>${orderRM(order.data.total)}</strong><small>Submitted estimate</small></div><button id="order-review-toggle-${esc(order.id)}" type="button" class="${open?'secondary':'primary'} order-review-toggle" data-review-order="${esc(order.id)}" aria-expanded="${open}" aria-controls="order-expanded-${esc(order.id)}">${open?'Close review':order.status==='pending'?'Review':'View details'}</button></div></div><section id="order-expanded-${esc(order.id)}" class="order-expanded" aria-label="Review ${esc(order.reference)}" ${open?'':'hidden'}>${open?(orderReviewLoading?'<p class="order-review-notice" role="status">Checking the latest order and stock…</p>':orderReviewError?`<p class="order-inline-error" role="alert">${esc(orderReviewError)} <button type="button" class="secondary" data-retry-order="${esc(order.id)}">Retry</button></p>`:ready?orderReviewContent(expandedOrder):''):''}</section></article>`;
 }).join(''):`<div class="empty orders-empty"><strong>No ${esc(orderStatus)} orders${$('#orders-search').value?' found':''}.</strong>${orderStatus==='pending'?'<p>Customer submissions will appear here for review.</p><a href="/order" target="_blank" rel="noopener">Open the customer form ↗</a>':''}</div>`;
 $('#orders-page').textContent=orderTotal?'Page '+orderPage+' of '+Math.ceil(orderTotal/30):'';$('#orders-prev').disabled=orderPage===1;$('#orders-next').disabled=orderPage*30>=orderTotal;
}
function collapseOrderReview(){++orderReviewRequest;expandedOrderId=null;expandedOrder=null;orderReviewError='';orderReviewLoading=false}
async function loadOrders({preserveReview=true}={}){
 const request=++orderRequest,previousId=preserveReview?expandedOrderId:null;
 ++orderReviewRequest;orderReviewLoading=false;$('#orders-list').setAttribute('aria-busy','true');$('#orders-message').textContent='Loading orders…';$('#orders-list').querySelectorAll('button').forEach(button=>button.disabled=true);
 try{
  const data=await api('orders?'+new URLSearchParams({status:orderStatus,q:$('#orders-search').value.trim(),page:orderPage,sort:$('#orders-sort').value}));if(request!==orderRequest)return;
  orderRows=data.orders;orderTotal=data.total;orderBadge(data.pending);if(!orderRows.length&&orderPage>1){orderPage--;return loadOrders({preserveReview:false})}
  document.querySelectorAll('[data-order-count]').forEach(el=>{const value=data.counts?.[el.dataset.orderCount];el.hidden=value===undefined;el.textContent=value??''});
  expandedOrderId=orderRows.some(o=>o.id===previousId)?previousId:autoExpandOrder?orderRows[0]?.id||null:null;autoExpandOrder=false;expandedOrder=null;orderReviewError='';orderReviewLoading=!!expandedOrderId;
  $('#orders-message').textContent=data.total+' '+orderStatus+' '+(data.total===1?'order':'orders');renderOrderList();if(expandedOrderId)await reviewOrder(expandedOrderId,{force:true,focus:false});
 }catch(error){if(request===orderRequest){$('#orders-message').textContent=error.message||'Could not load orders. Use Refresh to try again.';renderOrderList()}}
 finally{if(request===orderRequest)$('#orders-list').setAttribute('aria-busy','false')}
}
async function latestOrder(snapshot){const data=await api('orders?'+new URLSearchParams({status:snapshot.status,q:snapshot.reference}));return data.orders.find(order=>order.id===snapshot.id)}
async function reviewOrder(id,{force=false,focus=true}={}){
 if(orderActionBusy)return;
 if(expandedOrderId===id&&!force){collapseOrderReview();renderOrderList();document.getElementById('order-review-toggle-'+id)?.focus({preventScroll:true});return}
 const old=orderRows.find(row=>row.id===id);if(!old)return;
 const request=++orderReviewRequest;expandedOrderId=id;expandedOrder=null;orderReviewLoading=true;orderReviewError='';renderOrderList();
 try{
  await refreshCloud();const order=await latestOrder(old);if(request!==orderReviewRequest||expandedOrderId!==id)return;
  if(!order){collapseOrderReview();toast('This order was processed by another employee. The list has been refreshed.');return loadOrders({preserveReview:false})}
  orderRows=orderRows.map(row=>row.id===id?order:row);expandedOrder=order;orderReviewLoading=false;renderOrderList();
  if(focus){document.getElementById('order-review-toggle-'+id)?.focus({preventScroll:true});if(window.matchMedia('(max-width:650px)').matches)document.getElementById('order-expanded-'+id)?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 }catch(error){if(request!==orderReviewRequest||expandedOrderId!==id)return;orderReviewLoading=false;orderReviewError=error.message||'Could not open this order.';renderOrderList()}
}
function canReplaceOrderEditor(){
 if(typeof activeDocumentSave!=='undefined'&&activeDocumentSave){toast('A document is being saved. Please wait.');return false}
 const saved=db.documents.find(item=>item.id===doc.id);return InvoiceCore.sameDocumentContent(doc,saved||fresh(doc.type))||confirm('Replace the unfinished document with this invoice?');
}
async function createOrderInvoice(id){
 if(orderActionBusy||expandedOrder?.id!==id||expandedOrder.status!=='pending')return;
 const snapshot=expandedOrder,useCurrent=!!currentOrderPrices.get(id);orderActionBusy=true;renderOrderList();
 try{
  await refreshCloud();const latest=await latestOrder(snapshot);
  if(!latest||latest.revision!==snapshot.revision){toast('This order changed or was processed. Review its latest version.');collapseOrderReview();return await loadOrders({preserveReview:false})}
  if(doc.orderId===latest.id){show('editor');return}
  if(!canReplaceOrderEditor())return;
  doc=fresh('invoice');doc.currency='MYR';doc.customer=latest.data.business;doc.email=latest.data.email;doc.address=[latest.data.delivery==='pickup'?'':orderAddress(latest.data),'Phone: '+latest.data.phone].filter(Boolean).join('\n');doc.reference=latest.reference;
  doc.items=latest.data.items.map(item=>({...item,price:useCurrent?(cloud.products.find(product=>product.id===item.productId)?.price_myr??item.price):item.price}));
  doc.setupChargeRate=useCurrent?chargeRate('MYR'):latest.data.setupRate;doc.orderId=latest.id;doc.orderRevision=latest.revision;doc.orderDelivery=latest.data.delivery;syncSetupCharge();render();draft();show('editor');window.scrollTo({top:0,behavior:'smooth'});
 }catch(error){toast(error.message||'Could not create the invoice. Try again.')}
 finally{orderActionBusy=false;renderOrderList()}
}
async function openOrderInvoice(id){
 if(orderActionBusy||expandedOrder?.id!==id)return;const snapshot=expandedOrder;orderActionBusy=true;renderOrderList();
 try{await refreshCloud();const current=await latestOrder(snapshot),invoice=db.documents.find(d=>d.id===current?.document_id);if(!invoice||current.document_deleted)return toast('The linked invoice is unavailable. Refresh the workspace.');if(!canReplaceOrderEditor())return;doc=structuredClone(invoice);render();draft();show('editor');window.scrollTo({top:0,behavior:'smooth'})}catch(error){toast(error.message)}finally{orderActionBusy=false;renderOrderList()}
}
$('#orders-list').onclick=event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.reviewOrder)return reviewOrder(button.dataset.reviewOrder);if(button.dataset.retryOrder)return reviewOrder(button.dataset.retryOrder,{force:true});if(button.dataset.createOrderInvoice)return createOrderInvoice(button.dataset.createOrderInvoice);if(button.dataset.openOrderInvoice)return openOrderInvoice(button.dataset.openOrderInvoice);
 if(button.dataset.rejectOrder){const order=expandedOrder;if(order?.id!==button.dataset.rejectOrder||order.status!=='pending')return;rejectOrderRequest={id:order.id,revision:order.revision,operationId:crypto.randomUUID()};$('#reject-order-name').textContent=order.data.business+' · '+order.reference;$('#reject-order-error').hidden=true;rejectOrderDialog.showModal()}
};
$('#orders-list').onchange=event=>{if(event.target.id==='order-current-prices'&&expandedOrderId)currentOrderPrices.set(expandedOrderId,event.target.checked)};
$('#reject-order-close').onclick=()=>{if(!rejectOrderBusy)rejectOrderDialog.close()};rejectOrderDialog.addEventListener('cancel',event=>{if(rejectOrderBusy)event.preventDefault()});
$('#reject-order-confirm').onclick=async()=>{
 if(rejectOrderBusy||!rejectOrderRequest)return;rejectOrderBusy=true;$('#reject-order-confirm').disabled=$('#reject-order-close').disabled=true;
 try{await api('reject-order',rejectOrderRequest);rejectOrderDialog.close();collapseOrderReview();autoExpandOrder=true;await loadOrders({preserveReview:false});toast('Order rejected. Stock unchanged.')}
 catch(error){$('#reject-order-error').textContent=error.message;$('#reject-order-error').hidden=false}
 finally{rejectOrderBusy=false;$('#reject-order-confirm').disabled=$('#reject-order-close').disabled=false}
};
function setOrderStatus(status){orderStatus=status;orderPage=1;collapseOrderReview();autoExpandOrder=true;document.querySelectorAll('[data-order-status]').forEach(button=>{const active=button.dataset.orderStatus===status;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});$('#orders-results').setAttribute('aria-labelledby','orders-'+status+'-tab');loadOrders({preserveReview:false})}
document.querySelectorAll('[data-order-status]').forEach(button=>{button.tabIndex=button.dataset.orderStatus===orderStatus?0:-1;button.onclick=()=>setOrderStatus(button.dataset.orderStatus);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['pending','approved','rejected'],index=tabs.indexOf(orderStatus),next=event.key==='Home'?'pending':event.key==='End'?'rejected':tabs[(index+(event.key==='ArrowRight'?1:2))%3];setOrderStatus(next);$('#orders-'+next+'-tab').focus()}});
$('#orders-prev').onclick=()=>{if(orderPage>1){orderPage--;collapseOrderReview();autoExpandOrder=true;loadOrders({preserveReview:false})}};$('#orders-next').onclick=()=>{if(orderPage*30<orderTotal){orderPage++;collapseOrderReview();autoExpandOrder=true;loadOrders({preserveReview:false})}};
$('#refresh-orders').onclick=()=>loadOrders();
$('#orders-search').oninput=()=>{clearTimeout(loadOrders.searchTimer);++orderRequest;collapseOrderReview();renderOrderList();$('#orders-list').setAttribute('aria-busy','true');$('#orders-list').querySelectorAll('button').forEach(button=>button.disabled=true);$('#orders-message').textContent='Searching orders…';loadOrders.searchTimer=setTimeout(()=>{orderPage=1;autoExpandOrder=false;loadOrders({preserveReview:false})},300)};
$('#orders-sort').onchange=()=>{orderPage=1;collapseOrderReview();autoExpandOrder=true;loadOrders({preserveReview:false})};
$('#copy-order-link').onclick=async()=>{const link=new URL('/order',location.origin).href;try{await navigator.clipboard.writeText(link);$('#order-form-tools').open=false;toast('Order form link copied.')}catch{prompt('Copy this order form link:',link)}};
document.addEventListener('pointerdown',event=>{const menu=$('#order-form-tools');if(!menu.contains(event.target))menu.open=false});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#order-form-tools').open){$('#order-form-tools').open=false;$('#order-form-tools summary').focus()}});
const showBeforeOrders=show;show=function(page){showBeforeOrders(page);if(page==='orders'){$('#page-title').textContent='Pending Order';loadOrders()}else if(orderReviewLoading)collapseOrderReview()};
const renderBeforeOrders=render;render=function(){renderBeforeOrders();sourceOrderBanner.hidden=!doc.orderId;sourceOrderBanner.textContent=doc.orderId?'Order '+doc.reference+(doc.status==='confirmed'?' · Approved':doc.orderDelivery==='delivery'?' · Check shipping cost, then Confirm to approve.':' · Confirm to approve and deduct stock.'):'';if(doc.orderId){$('#currency').disabled=true;$('#receipt-mode').disabled=true}else $('#receipt-mode').disabled=false};
const modeBeforeOrders=mode;mode=function(type){if(doc.orderId&&type!=='invoice')return toast('Customer orders create invoices. Use New document to create a manual receipt.');modeBeforeOrders(type)};
async function refreshOrderInbox(){if(document.visibilityState!=='visible'||!cloudReady||rejectOrderDialog.open)return;try{if(!$('#orders').hidden&&!expandedOrderId&&!orderReviewLoading&&!orderActionBusy)await loadOrders();else orderBadge((await api('orders?summary=1')).pending)}catch{}}
setInterval(refreshOrderInbox,30000);document.addEventListener('visibilitychange',refreshOrderInbox);window.addEventListener('focus',refreshOrderInbox);
const saveBeforeOrders=save;save=async function(action){const result=await saveBeforeOrders(action);if(result)refreshOrderInbox();return result};refreshCloud().then(refreshOrderInbox).catch(()=>{});
