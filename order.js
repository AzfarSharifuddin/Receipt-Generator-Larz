'use strict';
const find=s=>document.querySelector(s),escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=cents=>'RM '+(cents/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}),cents=value=>Math.round((value+Number.EPSILON)*100);
let catalog=null,quantities=new Map(),submitting=false,retryPayload=null,submissionId=crypto.randomUUID();
const form=find('#order-form'),submitButton=find('#submit-order');
let reviewing=false,photoTrigger=null;
const verification=new OrderVerification({container:find('#order-verification'),status:find('#verification-status'),retry:find('#verification-retry'),onChange:updateSummary});
async function loadCatalog(){
 const status=find('#catalog-status');status.hidden=false;status.textContent='Loading products…';
 try{
  const response=await fetch('/api/public/catalog');const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load products.');
  catalog=data;form.hidden=false;status.hidden=true;
  find('#products').innerHTML=data.products.length?data.products.map(product=>`<article class="product-card" data-product="${escapeHTML(product.id)}">${product.image?`<button type="button" class="product-image" data-photo="${escapeHTML(product.id)}" aria-label="View photo of ${escapeHTML(product.name)}"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy"></button>`:'<div class="product-image">Image unavailable</div>'}<div class="product-info"><h3>${escapeHTML(product.name)}</h3><div class="product-controls"><p class="product-price">${cash(cents(product.price))} <small>/ pc</small></p><button type="button" class="add-product" data-add="${escapeHTML(product.id)}" ${product.available?'':'disabled'}>${product.available?'+ Add':'Unavailable'}</button><div class="qty-counter" hidden><button type="button" data-adjust="-1" aria-label="Reduce quantity of ${escapeHTML(product.name)}">−</button><input type="number" min="0" max="1000" step="1" value="0" inputmode="numeric" aria-label="Quantity of ${escapeHTML(product.name)}"><button type="button" data-adjust="1" aria-label="Increase quantity of ${escapeHTML(product.name)}">+</button></div></div></div></article>`).join(''):'<p class="empty-products">No products are available for ordering yet. Please check back soon.</p>';
  updateSummary();
 }catch(error){status.textContent=error.message||'Could not load products. Please try again.';const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=loadCatalog;status.append(retry)}
}
function setQuantity(id,value){
 if(submitting||retryPayload||!catalog?.products.some(p=>p.id===id&&p.available))return;
 const qty=Math.max(0,Math.min(1000,Math.floor(Number(value)||0)));quantities.set(id,qty);
 const card=find(`[data-product="${id}"]`);card.classList.toggle('selected',qty>0);card.querySelector('.qty-counter').hidden=!qty;card.querySelector('.add-product').hidden=qty>0;card.querySelector('input').value=qty;card.querySelector('[data-adjust="1"]').disabled=qty>=1000;
 if(!qty)card.querySelector('.add-product').focus();
 updateSummary();find('#products-error').hidden=true;
}
find('#products').addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 if(button.dataset.photo){openProductPhoto(button.dataset.photo,button);return}
 const id=button.closest('[data-product]').dataset.product;
 setQuantity(id,button.dataset.add?1:(quantities.get(id)||0)+Number(button.dataset.adjust));
 if(button.dataset.add)find(`[data-product="${id}"] [data-adjust="1"]`).focus({preventScroll:true});
});
find('#products').addEventListener('change',event=>{if(event.target.matches('input'))setQuantity(event.target.closest('[data-product]').dataset.product,event.target.value)});
find('#products').addEventListener('input',event=>{const input=event.target;if(input.matches('input')&&!submitting&&!retryPayload&&(input.value===''||input.validity.valid)){quantities.set(input.closest('[data-product]').dataset.product,Number(input.value)||0);updateSummary()}});
function updateSummary(){
 if(!catalog)return;
 const selected=catalog.products.filter(product=>quantities.get(product.id)>0);
 let subtotal=0,pieces=0;
 find('#summary-items').innerHTML=selected.length?selected.map(product=>{const qty=quantities.get(product.id),amount=cents(qty*product.price);subtotal+=amount;pieces+=qty;return `<div class="summary-item"><div>${escapeHTML(product.name)}<small>${qty} × ${cash(cents(product.price))}</small></div><span>${cash(amount)}</span></div>`}).join(''):'<p class="helper">Choose a product to get started.</p>';
 const setup=cents(pieces*catalog.setupRate);
 find('#selected-count').textContent=pieces+' '+(pieces===1?'pc':'pcs');
 find('#subtotal').textContent=cash(subtotal);find('#setup-total').textContent=cash(setup);find('#setup-detail').textContent=pieces+' pcs × '+cash(cents(catalog.setupRate));find('#order-total').textContent=cash(subtotal+setup);
 find('#builder-subtotal').textContent=cash(subtotal);find('#builder-setup-total').textContent=cash(setup);find('#builder-setup-detail').textContent=find('#setup-detail').textContent;find('#bar-total').textContent=cash(subtotal+setup);find('#bar-pieces').textContent=pieces+' pcs · includes setup';
 find('#review-order').disabled=submitting||!!retryPayload||!selected.length;
 submitButton.disabled=submitting||!selected.length||!verification.token;
}
form.addEventListener('change',event=>{
 if(event.target.name!=='delivery')return;
 const pickup=event.target.value==='pickup';find('#address-fields').hidden=pickup;find('#address-fields').disabled=pickup;find('#pickup-note').hidden=!pickup;find('#shipping-row').hidden=pickup;find('#estimate-note').hidden=pickup;
 document.querySelectorAll('.shipping-estimate').forEach(el=>el.hidden=pickup);
});
function freezeForm(frozen){form.querySelectorAll('input,button').forEach(input=>input.disabled=frozen);find('#verification-retry').disabled=submitting;if(!frozen){find('#address-fields').disabled=find('input[name="delivery"]:checked').value==='pickup';catalog?.products.filter(p=>!p.available).forEach(p=>find(`[data-add="${p.id}"]`).disabled=true);catalog?.products.forEach(p=>{const plus=find(`[data-product="${p.id}"] [data-adjust="1"]`);if(plus)plus.disabled=(quantities.get(p.id)||0)>=1000});updateSummary()}}
function editOrder(target='products-title'){
 if(submitting||retryPayload)return;
 reviewing=false;find('#order-review').hidden=true;find('#order-builder').hidden=false;find('#order-heading').textContent='Your order.';
 if(target!=='products-title')find('#customer-details').open=true;
 find('#'+target).focus({preventScroll:true});find('#'+target).scrollIntoView({behavior:scrollBehavior(),block:'start'});
}
function scrollBehavior(){return window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}
function orderItems(){return [...quantities].filter(([,qty])=>qty>0).map(([productId,qty])=>({productId,qty}))}
function validateOrder(){
 const items=orderItems();
 if(!items.length||items.length>30||items.reduce((s,i)=>s+i.qty,0)>10000){editOrder();const box=find('#products-error');box.textContent=!items.length?'Choose at least one product.':'Maximum 30 products and 10,000 pieces per order.';box.hidden=false;return false}
 // Open the disclosure before native validation tries to focus its fields.
 if(!form.checkValidity()){
  editOrder('business');form.reportValidity();return false;
 }
 for(const key of ['business','phone',...(find('input[name="delivery"]:checked').value==='delivery'?['street','postcode','city','state','country']:[])]){
  const input=find('#'+key);if(!input.value.trim()){editOrder(key);input.setCustomValidity('Please complete this field.');input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});return false}
 }
 return true;
}
function reviewOrder(){
 if(submitting||retryPayload||!catalog||!validateOrder())return;
 const delivery=find('input[name="delivery"]:checked').value;
 find('#review-customer').innerHTML=`<strong>${escapeHTML(find('#business').value.trim())}</strong><p>${escapeHTML(find('#phone').value.trim())}${find('#email').value.trim()?'<br>'+escapeHTML(find('#email').value.trim()):''}</p><p>${delivery==='pickup'?'Self-collection':'Delivery<br>'+['street','postcode','city','state','country'].map(key=>escapeHTML(find('#'+key).value.trim())).join('<br>')}</p>`;
 reviewing=true;find('#order-builder').hidden=true;find('#order-review').hidden=false;find('#order-heading').textContent='Review order.';find('#order-heading').focus({preventScroll:true});window.scrollTo({top:0,behavior:scrollBehavior()});
 if(!verification.siteKey)verification.configure(catalog.turnstile);updateSummary();
}
find('#review-order').onclick=reviewOrder;
form.addEventListener('click',event=>{const button=event.target.closest('[data-edit]');if(button)editOrder(button.dataset.edit)});
form.addEventListener('keydown',event=>{if(event.key==='Enter'&&!reviewing&&event.target.matches('input:not([type=radio])')){event.preventDefault();reviewOrder()}});
find('#customer-details').addEventListener('toggle',()=>find('#review-order').textContent=find('#customer-details').open?'Review order':'Continue');
function openProductPhoto(id,trigger){const product=catalog?.products.find(p=>p.id===id);if(!product?.image)return;photoTrigger=trigger;find('#photo-title').textContent=product.name;find('#photo-image').src=product.image;find('#photo-image').alt=product.name;find('#product-photo').showModal();find('#close-photo').focus()}
find('#close-photo').onclick=()=>find('#product-photo').close();
find('#product-photo').addEventListener('click',event=>{if(event.target===find('#product-photo'))find('#product-photo').close()});
find('#product-photo').addEventListener('close',()=>photoTrigger?.focus({preventScroll:true}));
function keyboardLayout(){const keyboard=window.visualViewport&&window.innerHeight-window.visualViewport.height>150&&document.activeElement?.matches('input');document.body.classList.toggle('order-keyboard',!!keyboard)}
window.visualViewport?.addEventListener('resize',keyboardLayout);document.addEventListener('focusin',keyboardLayout);document.addEventListener('focusout',()=>document.body.classList.remove('order-keyboard'));
form.addEventListener('submit',async event=>{
 event.preventDefault();if(submitting||!catalog)return;
 const errorBox=find('#submit-error');errorBox.hidden=true;
 if(!reviewing){reviewOrder();return}
 if(!retryPayload&&!validateOrder())return;
 const items=[...quantities].filter(([,qty])=>qty>0).map(([productId,qty])=>({productId,qty}));
 if(!items.length){find('#products-error').textContent='Choose at least one product.';find('#products-error').hidden=false;find('#products-title').scrollIntoView({behavior:'smooth'});return}
 if(items.length>30||items.reduce((s,i)=>s+i.qty,0)>10000){errorBox.textContent='Maximum 30 products and 10,000 pieces per order.';errorBox.hidden=false;return}
 if(!verification.token){errorBox.textContent='Please complete the security verification.';errorBox.hidden=false;return}
 const payload=retryPayload?{...retryPayload,turnstileToken:verification.token}:{submissionId,business:find('#business').value.trim(),phone:find('#phone').value.trim(),email:find('#email').value.trim(),delivery:find('input[name="delivery"]:checked').value,address:Object.fromEntries(['street','postcode','city','state','country'].map(key=>[key,find('#'+key).value.trim()])),items,token:catalog.token,website:find('#website').value,turnstileToken:verification.token};
 submitting=true;freezeForm(true);submitButton.textContent='Submitting…';
 let uncertain=true;
 try{
  if(Date.now()-Number(payload.token.split('.')[0])>6900000){const response=await fetch('/api/public/catalog');const fresh=await response.json();if(!response.ok)throw Error(fresh.error||'Could not refresh the form.');payload.token=fresh.token;catalog.token=fresh.token;await new Promise(resolve=>setTimeout(resolve,1100))}
  const response=await fetch('/api/public/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  if(response.status===429){uncertain=false;throw Error('Too many attempts. Please wait before trying again.')}
  const data=await response.json();
  uncertain=response.status>=500;
  if(!response.ok)throw Error(data.error||'Could not submit your order.');
  retryPayload=null;verification.destroy();form.hidden=true;find('.page-heading').hidden=true;find('#order-reference').textContent=data.reference;find('#order-success').hidden=false;find('#order-success').focus();window.scrollTo({top:0,behavior:'smooth'});
 }catch(error){
  retryPayload=uncertain?payload:null;
  errorBox.textContent=uncertain?'We could not verify the submission. Retry below to check the same order without creating a duplicate.':error.message;
  errorBox.hidden=false;
  verification.reset();
 }finally{
  submitting=false;
  find('#verification-retry').disabled=false;
  if(retryPayload){submitButton.disabled=!verification.token;submitButton.textContent='Retry submission'}else{freezeForm(false);submitButton.textContent='Submit order'}
 }
});
loadCatalog();
