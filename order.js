'use strict';
const find=s=>document.querySelector(s),escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=cents=>'RM '+(cents/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}),cents=value=>Math.round((value+Number.EPSILON)*100);
let catalog=null,quantities=new Map(),submitting=false,retryPayload=null,submissionId=crypto.randomUUID();
const form=find('#order-form'),submitButton=find('#submit-order');
const verification=new OrderVerification({container:find('#order-verification'),status:find('#verification-status'),retry:find('#verification-retry'),onChange:updateSummary});
async function loadCatalog(){
 const status=find('#catalog-status');status.hidden=false;status.textContent='Loading products…';
 try{
  const response=await fetch('/api/public/catalog');const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load products.');
  catalog=data;form.hidden=false;status.hidden=true;
  find('#products').innerHTML=data.products.length?data.products.map(product=>`<article class="product-card" data-product="${product.id}"><div class="product-image">${product.image?`<img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy">`:'Image unavailable'}</div><div class="product-info"><h3>${escapeHTML(product.name)}</h3><p class="product-price">${cash(cents(product.price))} / piece</p><button type="button" class="add-product" data-add="${product.id}" ${product.available?'':'disabled'}>${product.available?'Add to order':'Unavailable'}</button><div class="qty-counter" hidden><button type="button" data-adjust="-1" aria-label="Reduce quantity of ${escapeHTML(product.name)}">−</button><input type="number" min="0" max="1000" step="1" value="0" inputmode="numeric" aria-label="Quantity of ${escapeHTML(product.name)}"><button type="button" data-adjust="1" aria-label="Increase quantity of ${escapeHTML(product.name)}">+</button></div></div></article>`).join(''):'<p class="empty-products">No products are available for ordering yet. Please check back soon.</p>';
  verification.configure(data.turnstile);updateSummary();
 }catch(error){status.textContent=error.message||'Could not load products. Please try again.';const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=loadCatalog;status.append(retry)}
}
function setQuantity(id,value){
 const qty=Math.max(0,Math.min(1000,Math.floor(Number(value)||0)));quantities.set(id,qty);
 const card=find(`[data-product="${id}"]`);card.classList.toggle('selected',qty>0);card.querySelector('.qty-counter').hidden=!qty;card.querySelector('.add-product').hidden=qty>0;card.querySelector('input').value=qty;card.querySelector('[data-adjust="1"]').disabled=qty>=1000;
 if(!qty)card.querySelector('.add-product').focus();
 updateSummary();find('#products-error').hidden=true;
}
find('#products').addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 const id=button.closest('[data-product]').dataset.product;
 setQuantity(id,button.dataset.add?1:(quantities.get(id)||0)+Number(button.dataset.adjust));
 if(button.dataset.add)find(`[data-product="${id}"] input`).focus();
});
find('#products').addEventListener('change',event=>{if(event.target.matches('input'))setQuantity(event.target.closest('[data-product]').dataset.product,event.target.value)});
find('#products').addEventListener('input',event=>{const input=event.target;if(input.matches('input')&&input.value!==''&&input.validity.valid){quantities.set(input.closest('[data-product]').dataset.product,Number(input.value));updateSummary()}});
function updateSummary(){
 if(!catalog)return;
 const selected=catalog.products.filter(product=>quantities.get(product.id)>0);
 let subtotal=0,pieces=0;
 find('#summary-items').innerHTML=selected.length?selected.map(product=>{const qty=quantities.get(product.id),amount=cents(qty*product.price);subtotal+=amount;pieces+=qty;return `<div class="summary-item"><div>${escapeHTML(product.name)}<small>${qty} × ${cash(cents(product.price))}</small></div><span>${cash(amount)}</span></div>`}).join(''):'<p class="helper">Choose a product to get started.</p>';
 const setup=cents(pieces*catalog.setupRate);
 find('#selected-count').textContent=pieces+' '+(pieces===1?'piece':'pieces')+' selected';
 find('#subtotal').textContent=cash(subtotal);find('#setup-total').textContent=cash(setup);find('#setup-detail').textContent=pieces+' pcs × '+cash(cents(catalog.setupRate));find('#order-total').textContent=cash(subtotal+setup);
 submitButton.disabled=submitting||!selected.length||!verification.token;
}
form.addEventListener('change',event=>{
 if(event.target.name!=='delivery')return;
 const pickup=event.target.value==='pickup';find('#address-fields').hidden=pickup;find('#address-fields').disabled=pickup;find('#pickup-note').hidden=!pickup;find('#shipping-row').hidden=pickup;find('#estimate-note').hidden=pickup;
});
function freezeForm(frozen){form.querySelectorAll('input,button').forEach(input=>input.disabled=frozen);if(!frozen){find('#address-fields').disabled=find('input[name="delivery"]:checked').value==='pickup';catalog?.products.filter(p=>!p.available).forEach(p=>find(`[data-add="${p.id}"]`).disabled=true);updateSummary()}}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(submitting||!catalog)return;
 const errorBox=find('#submit-error');errorBox.hidden=true;
 if(!retryPayload&&!form.reportValidity())return;
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
  if(retryPayload){submitButton.disabled=!verification.token;submitButton.textContent='Retry submission'}else{freezeForm(false);submitButton.textContent='Submit order'}
 }
});
loadCatalog();
