'use strict';
// Presentation only: keep the editor's existing fields, event handlers and save pipeline.
let editorDetailDocument=null;
const editorDetailState=new Map();
function rememberEditorDetails(){
 if(editorDetailDocument!==doc.id){editorDetailState.clear();editorDetailDocument=doc.id;return}
 document.querySelectorAll('#editor details[data-editor-detail]').forEach(details=>editorDetailState.set(details.dataset.editorDetail,details.open));
}
function restoreEditorDetail(details,key){
 if(!details)return;details.dataset.editorDetail=key;
 if(editorDetailState.has(key))details.open=editorDetailState.get(key);
}
function decorateDocumentEditor(){
 const form=$('#document-form'),sections=[...form.querySelectorAll(':scope > .form-section')];
 if(sections.length!==6)return;
 const [business,documentDetails,customer,items,adjustments,payment]=sections;
 const b=doc.business;
 $('#editor-business-profile').innerHTML=`<details class="editor-business-profile"><summary>${esc(b.name||'Add your business details')}</summary><div><p>${esc(b.address)}</p><p>${esc(b.email)}${b.phone?'<br>'+esc(b.phone):''}</p>${b.registration?`<p>SSM Registration No. ${esc(b.registration)}</p>`:''}<button type="button" class="secondary" id="editor-business-settings">Edit business details</button></div></details>`;
 restoreEditorDetail($('#editor-business-profile details'),'business');business.remove();
 customer.querySelector('.section-title').textContent=doc.type==='receipt'?'Received from':'Customer';
 restoreEditorDetail(customer.querySelector('details'),'customer-address');
 documentDetails.querySelector('.section-title').textContent='Document details';
 const numberField=$('#number').closest('.field');numberField.classList.add('editor-number');documentDetails.append(numberField);
 items.querySelector('.section-title').innerHTML=`Items <span>Prices in ${esc(doc.currency)}</span>`;
 items.querySelector('.item-head span').textContent='Product';
 const setupField=$('#setup-charge-summary').closest('.field');setupField.classList.add('editor-setup');items.append(setupField);
 const chargeDetails=adjustments.querySelector('details');
 chargeDetails.querySelector('summary').textContent='Discount, tax & shipping';chargeDetails.open=!!(doc.discount||doc.tax||doc.shippingCost);
 restoreEditorDetail(chargeDetails,'charges');items.append(chargeDetails);adjustments.remove();
 const paymentTitle=payment.querySelector('.section-title');paymentTitle.remove();
 const paymentDetails=document.createElement('details'),summary=document.createElement('summary');summary.textContent=doc.type==='receipt'?'Payment received':'Payment & notes';paymentDetails.append(summary);
 for(const child of [...payment.childNodes])paymentDetails.append(child);
 restoreEditorDetail(paymentDetails,'payment');if(doc.type==='receipt'||doc.paid||doc.notes)paymentDetails.open=true;
 restoreEditorDetail(paymentDetails.querySelector('details'),'notes');payment.append(paymentDetails);
 for(const section of [customer,documentDetails,items,payment]){section.classList.add('editor-section');form.append(section)}
 updateEditorProductInfo();updateEditorTotal();
}
function updateEditorProductInfo(){
 // Inventory supplies availability; quoted documents retain their recorded unit price.
 $('#document-form').querySelectorAll('.product-choice').forEach((holder,index)=>{
  const item=doc.items[index],product=cloud.products.find(p=>p.id===item.productId);
  if(!item)return;
  if(!holder.querySelector('img,.editor-product-placeholder')){const placeholder=document.createElement('span');placeholder.className='editor-product-placeholder';placeholder.textContent='—';placeholder.setAttribute('aria-hidden','true');holder.prepend(placeholder)}
  let meta=holder.querySelector('.editor-item-meta');if(!meta){meta=document.createElement('small');meta.className='editor-item-meta';holder.append(meta)}
  meta.textContent=item.productId||item.description?`${money(InvoiceCore.round(item.price))} each${product?' · '+product.stock+' available':''}`:'Choose from inventory';
  const select=holder.querySelector('select');for(const option of select?.options||[]){const source=cloud.products.find(p=>p.id===option.value);if(source)option.textContent=`${source.name} · ${source.sku} (${source.stock} available)`}
 });
}
function updateEditorTotal(){const total=$('#editor-total');if(total)total.textContent=money(InvoiceCore.totals(doc).total)}
const renderBeforeSplitEditor=render;
render=function(){rememberEditorDetails();renderBeforeSplitEditor();decorateDocumentEditor()};
const previewBeforeSplitEditor=preview;
preview=function(){previewBeforeSplitEditor();updateEditorTotal()};
const refreshBeforeSplitEditor=refreshCloud;
refreshCloud=async function(){const result=await refreshBeforeSplitEditor();updateEditorProductInfo();return result};
$('#editor-business-profile').addEventListener('click',event=>{if(event.target.closest('#editor-business-settings'))show('settings')});
render();
