'use strict';

// Prepare after saving, then share from a fresh tap (required by iOS Safari).
const sharePDFButton=$('#print');
sharePDFButton.setAttribute('aria-haspopup','dialog');
sharePDFButton.title='Save or share the PDF';

const sharePDFDialog=document.createElement('dialog');
sharePDFDialog.className='share-pdf-dialog';
sharePDFDialog.setAttribute('aria-labelledby','share-pdf-title');
sharePDFDialog.innerHTML='<h2 id="share-pdf-title">PDF options</h2><p id="share-pdf-name" class="share-pdf-name"></p><p id="share-pdf-message" role="status"></p><div class="share-pdf-actions"><button type="button" id="share-pdf-download" class="primary" autofocus>Save PDF</button><button type="button" id="share-pdf-send" class="secondary">Share PDF</button><button type="button" id="share-pdf-close" class="secondary">Close</button></div>';
document.body.append(sharePDFDialog);
let preparedSharePDF=null,sharingPDF=false,preparingSharePDF=false;

sharePDFButton.onclick=async()=>{
 if(sharePDFButton.disabled||preparingSharePDF)return;
 preparingSharePDF=true;
 sharePDFButton.disabled=true;sharePDFButton.textContent='Preparing PDF…';
 try{
  if(!await saveWithDecision())return;
  preparedSharePDF=createDocumentPDF(structuredClone(doc));
  const {pdf,filename}=preparedSharePDF;
  const file=typeof File==='function'?new File([pdf.output('blob')],filename,{type:'application/pdf'}):null;
  let supported=false;
  try{supported=!!(file&&navigator.share&&navigator.canShare?.({files:[file]}))}catch{}
  preparedSharePDF.file=file;
  $('#share-pdf-name').textContent=filename;
  $('#share-pdf-message').textContent=supported?'Choose WhatsApp in the next share menu.':'This browser cannot share PDF files directly. Use Save PDF to download this document.';
  $('#share-pdf-send').hidden=!supported;
  sharePDFDialog.showModal();
 }catch(error){
  preparedSharePDF=null;
  console.error('PDF preparation failed',error);
  toast('Could not create the PDF. Check your logo and try again.');
 }finally{preparingSharePDF=false;sharePDFButton.disabled=doc.status==='cancelled';sharePDFButton.textContent='PDF options'}
};

$('#share-pdf-send').onclick=async()=>{
 if(!preparedSharePDF||sharingPDF)return;
 sharingPDF=true;
 const button=$('#share-pdf-send');button.disabled=true;
 $('#share-pdf-download').disabled=true;
 try{
  // No asynchronous work before this call: keep the user's tap available.
  await navigator.share({files:[preparedSharePDF.file]});
  sharePDFDialog.close();
 }catch(error){
  if(error.name!=='AbortError')$('#share-pdf-message').textContent='Sharing was unavailable. Try again or use Save PDF.';
 }finally{sharingPDF=false;button.disabled=false;$('#share-pdf-download').disabled=false}
};
$('#share-pdf-download').onclick=()=>{
 if(!preparedSharePDF||sharingPDF)return;
 try{preparedSharePDF.pdf.save(preparedSharePDF.filename);sharePDFDialog.close();toast('PDF download started.')}
 catch(error){$('#share-pdf-message').textContent='Could not download the PDF. Close this window and try again.'}
};
$('#share-pdf-close').onclick=()=>{if(!sharingPDF)sharePDFDialog.close()};
sharePDFDialog.addEventListener('cancel',event=>{if(sharingPDF)event.preventDefault()});
sharePDFDialog.addEventListener('close',()=>{preparedSharePDF=null});

const renderBeforePDFSharing=render;
render=function(){renderBeforePDFSharing();sharePDFButton.disabled=preparingSharePDF||doc.status==='cancelled'};
sharePDFButton.disabled=doc.status==='cancelled';
