'use strict';

// Shared, deterministic presentation rules; no stock mutations happen here.
(function(root){
 function status(product){return !product.active?'Archived':product.stock===0?'Out of stock':product.stock<=product.low_stock?'Low stock':'In stock'}
 function filter(products,query='',kind='all'){
  const term=query.trim().toLowerCase();
  return products.filter(p=>(p.name+' '+p.sku).toLowerCase().includes(term)&&(kind==='all'||kind==='low'&&p.active&&p.stock>0&&p.stock<=p.low_stock||kind==='out'&&p.active&&p.stock===0||kind==='public'&&p.active&&p.public_order||kind==='archived'&&!p.active));
 }
 function stockChange(product,direction,quantity,reason){
  const qty=Number(quantity);
  if(!['in','out'].includes(direction)||!Number.isSafeInteger(qty)||qty<1||qty>1e7)return {error:'Enter a positive whole quantity.'};
  if(typeof reason!=='string'||!reason.trim()||reason.length>300||/[\x00-\x1f]/.test(reason))return {error:'Enter a reason, up to 300 characters.'};
  const delta=direction==='out'?-qty:qty,next=product.stock+delta;
  if(next<0||next>1e7)return {error:next<0?'There is not enough stock to remove that quantity.':'The resulting stock exceeds the allowed limit.'};
  return {delta,next,reason:reason.trim()};
 }
 const helpers={status,filter,stockChange};root.InventoryUI=helpers;if(typeof module!=='undefined')module.exports=helpers;
})(typeof window!=='undefined'?window:globalThis);

if(typeof document!=='undefined'){
 const inventoryState={tab:'products',selected:null,page:1,direction:'all'};
 let movementState={key:'',rows:[],total:0,limit:20,loading:false,error:''},movementRequest=0;
 const stockDialog=$('#stock-dialog'),deleteDialog=$('#delete-product-dialog');
 let adjustingProduct=null,stockPending=null,stockBusy=false,deletingProduct=null,deleteBusy=false;
 const quantity=n=>Number(n).toLocaleString('en-GB');
 const money=n=>Number(n).toFixed(2);
 const photo=p=>p.image?`<img class="product-thumb stock-photo" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`:'<span class="stock-photo stock-photo-empty" aria-label="No product image">No image</span>';
 const badge=p=>`<span class="stock-badge ${!p.active?'stock-archived':p.stock<=p.low_stock?'stock-warning':''}">${InventoryUI.status(p)}</span>`;
 const localDay=value=>{const d=new Date(value);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`};
 function dayLabel(value){const date=new Date(value),todayDate=new Date(),yesterday=new Date();yesterday.setDate(todayDate.getDate()-1);const label=localDay(date)===localDay(todayDate)?'Today':localDay(date)===localDay(yesterday)?'Yesterday':'';return `${label?label+' · ':''}${date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`}
 function time(value){return new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
 function delta(row){return `<span class="stock-delta ${row.delta>0?'stock-added':'stock-removed'}"><span aria-hidden="true">${row.delta>0?'↙':'↗'}</span> ${row.delta>0?'+':''}${quantity(row.delta)} <small>pcs</small></span>`}
 function filteredProducts(){return InventoryUI.filter(cloud.products,$('#product-search').value,$('#product-filter').value)}
 function historyKey(){const params=new URLSearchParams({direction:inventoryState.tab==='products'?'all':inventoryState.direction,page:String(inventoryState.page)});if(inventoryState.tab==='products'&&inventoryState.selected)params.set('product',inventoryState.selected);return params.toString()}
 function renderProductList(){
  const products=filteredProducts();
  if(!products.some(p=>p.id===inventoryState.selected)){inventoryState.selected=products[0]?.id||null;if(inventoryState.tab==='products')inventoryState.page=1}
  $('#inventory-list').innerHTML=products.map(p=>`<button type="button" class="stock-product-pick" data-select-product="${esc(p.id)}" aria-pressed="${p.id===inventoryState.selected}">${photo(p)}<span class="stock-pick-info"><strong>${esc(p.name)}</strong><small>${esc(p.sku)}</small>${badge(p)}</span><span class="stock-pick-count">${quantity(p.stock)}<small>pcs</small></span></button>`).join('')||`<div class="stock-empty">${cloud.products.length?'No products match your search.':'Add your first product to start tracking stock.'}</div>`;
  renderProductDetail();
 }
 function renderProductDetail(){
  const p=cloud.products.find(p=>p.id===inventoryState.selected);
  $('#inventory-detail').innerHTML=p?`<div class="stock-detail-top"><div class="stock-detail-heading"><div class="stock-detail-identity">${photo(p)}<div><h2>${esc(p.name)}</h2><p class="stock-secondary">${esc(p.sku)}</p></div></div><details class="stock-product-menu"><summary aria-label="More actions for ${esc(p.name)}">⋯</summary><div><button type="button" class="stock-delete-action" data-delete-product="${esc(p.id)}">Delete product</button></div></details></div><div class="stock-level"><div><span>Available stock</span><strong>${quantity(p.stock)} <small>pcs</small></strong></div>${badge(p)}</div><div class="stock-detail-prices"><div><span>MYR price</span><strong>RM ${money(p.price_myr)}</strong></div><div><span>USD price</span><strong>US$ ${money(p.price_usd)}</strong></div><div><span>Low-stock alert</span><strong>${quantity(p.low_stock)} pcs</strong></div></div><div class="stock-detail-meta"><span class="stock-visibility">${p.public_order&&p.active?'Visible on order form':'Hidden from order form'}</span>${!p.active?'<span class="stock-secondary">Unavailable for new sales</span>':''}</div><div class="stock-detail-actions"><button type="button" class="primary" data-stock="${esc(p.id)}">Adjust stock</button><button type="button" class="secondary" data-edit-product="${esc(p.id)}">Edit product</button></div></div><section class="stock-history" aria-label="Product stock history"><h3>Stock history</h3><div id="product-movement-list"></div></section>`:'<div class="stock-empty">Select a product to see its details and stock history.</div>';
  renderMovementHistory();loadMovementHistory();
 }
 function pagination(){const start=movementState.total?(inventoryState.page-1)*movementState.limit+1:0,end=Math.min(inventoryState.page*movementState.limit,movementState.total);return `<div class="stock-pagination"><span>${quantity(start)}–${quantity(end)} of ${quantity(movementState.total)}</span><div><button type="button" class="secondary" data-movement-page="${inventoryState.page-1}" aria-label="Previous movements" ${inventoryState.page<=1?'disabled':''}>Previous</button><button type="button" class="secondary" data-movement-page="${inventoryState.page+1}" aria-label="Next movements" ${end>=movementState.total?'disabled':''}>Next</button></div></div>`}
 function renderMovementHistory(){
  const target=inventoryState.tab==='products'?$('#product-movement-list'):$('#movement-list');if(!target)return;
  if(movementState.key!==historyKey()||movementState.loading){target.innerHTML='<p class="stock-history-notice" role="status">Loading stock history…</p>';return}
  if(movementState.error){target.innerHTML=`<div class="stock-history-notice" role="alert">${esc(movementState.error)} <button type="button" class="secondary" data-retry-movements>Retry</button></div>`;return}
  if(!movementState.rows.length){target.innerHTML='<p class="stock-history-notice">No stock movements'+(inventoryState.tab==='products'?' for this product.':' matching this filter.')+'</p>';return}
  const groups=new Map();for(const row of movementState.rows){const day=localDay(row.created_at);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(row)}
  target.innerHTML=[...groups.values()].map(rows=>`<section class="stock-day-group"><h4>${esc(dayLabel(rows[0].created_at))}</h4>${inventoryState.tab==='products'?`<ol class="stock-timeline">${rows.map(row=>`<li><div class="stock-event-heading"><strong>${esc(row.reason)}</strong>${delta(row)}</div><div class="stock-event-meta">${row.number?`<span>${esc(row.number)}</span>`:''}<time datetime="${esc(row.created_at)}">${esc(time(row.created_at))}</time></div></li>`).join('')}</ol>`:`<div class="stock-ledger-wrap"><table class="stock-ledger"><thead><tr><th>Time</th><th>Product</th><th class="stock-number-cell">Change</th><th>Reason / reference</th></tr></thead><tbody>${rows.map(row=>`<tr><td class="stock-ledger-time"><time datetime="${esc(row.created_at)}">${esc(time(row.created_at))}</time></td><td class="stock-ledger-product"><strong>${esc(row.name)}</strong><small>${esc(row.sku)}</small></td><td class="stock-number-cell">${delta(row)}</td><td class="stock-ledger-reason">${esc(row.reason)}${row.number?`<small>${esc(row.number)}</small>`:''}</td></tr>`).join('')}</tbody></table></div>`}</section>`).join('')+pagination();
 }
 async function loadMovementHistory(force=false){
  if($('#inventory').hidden||inventoryState.tab==='products'&&!inventoryState.selected)return;
  const key=historyKey();if(!force&&movementState.key===key)return;
  const request=++movementRequest;movementState={...movementState,key,loading:true,error:'',rows:[]};renderMovementHistory();
  try{const result=await api('movements?'+key);if(request!==movementRequest||key!==historyKey())return;inventoryState.page=result.page;movementState={key:historyKey(),rows:result.movements,total:result.total,limit:result.limit,loading:false,error:''};renderMovementHistory()}
  catch(error){if(request!==movementRequest||key!==historyKey())return;movementState.loading=false;movementState.error=error.message||'Could not load stock history.';renderMovementHistory()}
 }
 function inventoryView(){
  const products=cloud.products;
  $('#inventory-summary').innerHTML=`<span><strong>${quantity(products.length)}</strong> Products</span><span><strong>${quantity(products.filter(p=>p.active&&p.stock>0&&p.stock<=p.low_stock).length)}</strong> Low stock</span><span><strong>${quantity(products.filter(p=>p.active&&p.stock===0).length)}</strong> Out of stock</span>`;
  movementState.key='';renderProductList();
 }
 // Cloud refreshes call this entry point after replacing the product snapshot.
 window.inventoryView=inventoryView;
 function scrollInventoryDetail(){if(window.matchMedia&&window.matchMedia('(max-width:880px)').matches)$('#inventory-detail').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 window.focusInventoryProduct=id=>{inventoryState.selected=id;$('#product-search').value='';$('#product-filter').value='all';switchInventoryTab('products');scrollInventoryDetail()};
 function switchInventoryTab(tab){
  inventoryState.tab=tab;inventoryState.page=1;
  for(const name of ['products','movements']){const active=name===tab;$('#inventory-'+name+'-tab').setAttribute('aria-selected',String(active));$('#inventory-'+name+'-tab').tabIndex=active?0:-1;$('#inventory-'+name+'-panel').hidden=!active}
  if(tab==='products')renderProductList();else renderMovementHistory();loadMovementHistory();
 }
 for(const tab of ['products','movements']){
  $('#inventory-'+tab+'-tab').onclick=()=>switchInventoryTab(tab);
  $('#inventory-'+tab+'-tab').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'products':e.key==='End'?'movements':tab==='products'?'movements':'products';switchInventoryTab(next);$('#inventory-'+next+'-tab').focus()};
 }
 $('#inventory-movements-tab').tabIndex=-1;
 $('#product-search').oninput=()=>renderProductList();$('#product-filter').onchange=()=>renderProductList();
 $('#movement-direction').onchange=e=>{inventoryState.direction=e.target.value;inventoryState.page=1;loadMovementHistory()};
 $('#refresh-stock').onclick=async()=>{const b=$('#refresh-stock');b.disabled=true;try{await refreshCloud();$('#inventory-message').textContent='Inventory refreshed.'}catch(error){$('#inventory-message').textContent=error.message}finally{b.disabled=false}};
 $('#add-product').onclick=()=>editProduct();
 $('#inventory').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.selectProduct){inventoryState.selected=b.dataset.selectProduct;inventoryState.page=1;renderProductList();$('#inventory-list').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});scrollInventoryDetail();return}
  if(b.dataset.movementPage){inventoryState.page=Number(b.dataset.movementPage);loadMovementHistory();return}
  if(b.hasAttribute('data-retry-movements')){loadMovementHistory(true);return}
  const id=b.dataset.editProduct||b.dataset.stock||b.dataset.deleteProduct,p=cloud.products.find(p=>p.id===id);if(!p)return;
  if(b.dataset.editProduct)editProduct(p);else if(b.dataset.stock)openStockAdjustment(p);else if(b.dataset.deleteProduct)openProductDeletion(p);
 });
 document.addEventListener('click',e=>{document.querySelectorAll('.stock-product-menu[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false})});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.stock-product-menu[open]').forEach(menu=>menu.open=false)});
 function stockPreview(){if(!adjustingProduct)return;const result=InventoryUI.stockChange(adjustingProduct,$('#stock-direction').value,$('#stock-quantity').value,$('#stock-reason').value||'Preview');$('#stock-result').textContent=result.error||`${quantity(adjustingProduct.stock)} pcs → ${quantity(result.next)} pcs`;$('#stock-result').classList.toggle('stock-result-invalid',!!result.error)}
 function openStockAdjustment(p){adjustingProduct=structuredClone(p);stockPending=null;$('#stock-form').reset();$('#stock-product-name').textContent=p.name;$('#stock-error').hidden=true;stockPreview();stockDialog.showModal();$('#stock-quantity').focus()}
 $('#stock-direction').onchange=stockPreview;$('#stock-quantity').oninput=stockPreview;
 $('#stock-close').onclick=()=>{if(!stockBusy)stockDialog.close()};stockDialog.addEventListener('cancel',e=>{if(stockBusy)e.preventDefault()});
 $('#stock-form').onsubmit=async e=>{
  e.preventDefault();if(stockBusy||!adjustingProduct)return;const result=InventoryUI.stockChange(adjustingProduct,$('#stock-direction').value,$('#stock-quantity').value,$('#stock-reason').value),notice=$('#stock-error');
  if(result.error){notice.textContent=result.error;notice.hidden=false;return}
  const payload={id:adjustingProduct.id,delta:result.delta,reason:result.reason};
  if(!stockPending||JSON.stringify(stockPending.payload)!==JSON.stringify(payload))stockPending={payload,operationId:crypto.randomUUID()};
  stockBusy=true;notice.hidden=true;$('#stock-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=true);$('#stock-submit').textContent='Updating…';
  let saved=false;
  try{await api('stock',{...stockPending.payload,operationId:stockPending.operationId});saved=true;stockPending=null;stockDialog.close();await refreshCloud();toast('Stock updated.')}
  catch(error){if(saved){toast('Stock updated. Refresh inventory to see the latest quantities.')}else{if(error.status&&error.status<500)stockPending=null;notice.textContent=error.message;notice.hidden=false}}
  finally{stockBusy=false;$('#stock-form').querySelectorAll('input,select,button').forEach(el=>el.disabled=false);$('#stock-submit').textContent='Update stock'}
 };
 function openProductDeletion(p){deletingProduct=structuredClone(p);$('#delete-product-name').textContent=p.name;$('#delete-product-error').hidden=true;document.querySelectorAll('.stock-product-menu[open]').forEach(menu=>menu.open=false);deleteDialog.showModal()}
 $('#delete-product-close').onclick=()=>{if(!deleteBusy)deleteDialog.close()};deleteDialog.addEventListener('cancel',e=>{if(deleteBusy)e.preventDefault()});
 $('#delete-product-confirm').onclick=async()=>{if(deleteBusy||!deletingProduct)return;deleteBusy=true;$('#delete-product-confirm').disabled=$('#delete-product-close').disabled=true;let saved=false;try{await operation('delete-product',{id:deletingProduct.id,revision:deletingProduct.revision});saved=true;deleteDialog.close();await refreshCloud();toast('Product deleted. Stock history retained.')}catch(error){if(saved)toast('Product deleted. Refresh inventory to update the list.');else{$('#delete-product-error').textContent=error.message;$('#delete-product-error').hidden=false}}finally{deleteBusy=false;$('#delete-product-confirm').disabled=$('#delete-product-close').disabled=false}};
}
