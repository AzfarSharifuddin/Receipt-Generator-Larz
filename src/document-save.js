'use strict';
let activeDocumentSave=null,pendingDocumentSave=null;
const documentConflictDialog=document.createElement('dialog');
documentConflictDialog.className='share-pdf-dialog';
documentConflictDialog.setAttribute('aria-labelledby','document-conflict-title');
document.body.append(documentConflictDialog);

function reviewDocumentConflict(latest,localDraft){
 cacheSavedDocument(latest);persist();
 return new Promise(resolve=>{
  const allowNew=!latest.orderId&&!latest.sourceInvoice&&!localDraft.orderId&&!localDraft.sourceInvoice;
  documentConflictDialog.innerHTML=`<h2 id="document-conflict-title">A saved version already exists</h2><p><strong>${esc(latest.number)}</strong><br>${esc(latest.customer)}</p><p>Your current draft is older or contains different details. Open the saved version to review it.</p>${allowNew?'<p>A new draft will become a separate sale when you Confirm it.</p>':''}<div class="share-pdf-actions"><button type="button" id="conflict-open" class="primary">Open saved version</button>${allowNew?'<button type="button" id="conflict-new" class="secondary">Keep as new draft</button>':''}<button type="button" id="conflict-keep" class="secondary" autofocus>Keep editing</button></div>`;
  let finished=false;
  const finish=choice=>{
   if(finished)return;finished=true;
   if(choice==='open'){doc=structuredClone(latest);persist();render();toast('Saved version opened. Review it before confirming.')}
   if(choice==='new'){
    doc={...structuredClone(localDraft),id:crypto.randomUUID(),number:number(localDraft.type)};
    for(const key of ['revision','status','updatedAt'])delete doc[key];
    persist();render();toast('New draft created. Confirm it only if this is a separate sale.');
   }
   documentConflictDialog.close();resolve(false);
  };
  $('#conflict-open').onclick=()=>finish('open');
  if(allowNew)$('#conflict-new').onclick=()=>finish('new');
  $('#conflict-keep').onclick=()=>finish('keep');
  documentConflictDialog.addEventListener('close',()=>finish('keep'),{once:true});
  documentConflictDialog.showModal();
 });
}

function cacheSavedDocument(saved){
 const update=rows=>{const index=rows.findIndex(item=>item.id===saved.id);if(index<0)rows.push(structuredClone(saved));else if((rows[index].revision||0)<=saved.revision)rows[index]=structuredClone(saved)};
 update(db.documents);update(cloud.documents);
}

async function submitDocumentSave(action,submitted){
 if((cloud.deletedDocumentIds||[]).includes(submitted.id)){toast('This document was deleted. Start a new document.');return false}
 if(submitted.status==='legacy')return {document:submitted};
 if(submitted.status==='cancelled')return false;
 if(!cloudReady){toast('Connecting to workspace. Try again shortly.');return false}
 const errors=InvoiceCore.validate(submitted);if(errors.length){toast(errors[0]);return false}
 const previous=pendingDocumentSave;
 const reusable=previous?.action===action&&previous.document?.id===submitted.id&&previous.document.revision===submitted.revision&&/^[0-9a-f-]{36}$/i.test(previous.operationId||'')&&InvoiceCore.sameDocumentContent(previous.document,submitted);
 const pending=reusable?previous:{action,document:submitted,operationId:crypto.randomUUID()};
 pendingDocumentSave=pending;
 try{
  const result=await api(action,{document:pending.document,operationId:pending.operationId});
  if(!result.document||result.document.id!==submitted.id)throw Error('The server did not return the saved document. Retry Confirm.');
  const saved=result.document;cacheSavedDocument(saved);
  if(doc.id===submitted.id&&doc.revision===submitted.revision){
   if(InvoiceCore.sameDocumentContent(doc,submitted))doc=structuredClone(saved);
   else for(const key of ['revision','status','number','sourceInvoice','orderId'])doc[key]=saved[key];
  }
  if(pendingDocumentSave?.operationId===pending.operationId)pendingDocumentSave=null;
  // Keep acknowledged documents in the cache before refreshing; unfinished forms stay in memory.
  persist();render();
  refreshCloud().catch(()=>{if(doc.id===saved.id)$('#save-status').textContent='Saved · list refresh pending'});
  return {document:structuredClone(saved),recovered:!!result.recovered};
 }catch(error){
  if(error.status&&error.status<500){if(pendingDocumentSave?.operationId===pending.operationId)pendingDocumentSave=null;persist()}
  if(error.code==='DOCUMENT_CONFLICT'&&error.currentDocument?.id===submitted.id&&doc.id===submitted.id)return reviewDocumentConflict(error.currentDocument,structuredClone(doc));
  toast(error.message||'Could not verify the save. Retry Confirm to check the same request.');return false;
 }
}

save=function(action='document'){
 const submitted=structuredClone(doc);
 if(activeDocumentSave){
  if(activeDocumentSave.action===action&&activeDocumentSave.document.id===submitted.id&&InvoiceCore.sameDocumentContent(activeDocumentSave.document,submitted))return activeDocumentSave.promise;
  toast('A document is being saved. Please wait.');return Promise.resolve(false);
 }
 const request={action,document:submitted,promise:null};activeDocumentSave=request;
 request.promise=submitDocumentSave(action,submitted).finally(()=>{if(activeDocumentSave===request)activeDocumentSave=null});
 return request.promise;
};
