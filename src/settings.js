'use strict';
let businessSettingsState=null,businessSettingsTab='business',businessLogoRequest=0;
const settingsForm=$('#settings-form');
const settingsFields={name:'business',registration:'business',address:'business',email:'business',phone:'business',logo:'logo',setupChargeMyr:'defaults',setupChargeUsd:'defaults',currency:'defaults',payment:'defaults'};
function normalizeBusinessSettings(business){return {...empty.business,...business,setupChargeMyr:business?.setupChargeMyr??2.5,setupChargeUsd:business?.setupChargeUsd??2.5}}
function settingsFingerprint(business){return JSON.stringify(Object.fromEntries(Object.entries(business).sort(([a],[b])=>a.localeCompare(b))))}
function settingsDirty(){return !!businessSettingsState&&settingsFingerprint(businessSettingsState.data)!==settingsFingerprint(businessSettingsState.saved)}
function savedSettingsSnapshot(){return {data:normalizeBusinessSettings(cloud.settings?.data||db.business),revision:cloud.settings?.revision||0}}
function adoptBusinessSettings(snapshot){
 const normalized=normalizeBusinessSettings(snapshot.data);
 businessSettingsState={...businessSettingsState,data:structuredClone(normalized),saved:structuredClone(normalized),revision:snapshot.revision,busy:false,logoReading:false,logoError:'',error:'',stale:false,pending:null,message:''};
}
function settingsInput(label,key,type='text',extra=''){
 const b=businessSettingsState.data;
 return `<div class="business-settings-field"><label for="settings-${key}">${label}</label><input id="settings-${key}" name="${key}" type="${type}" value="${esc(b[key])}" maxlength="${key==='email'?254:5000}" ${extra}></div>`;
}
function settingsLogoMarkup(){const logo=businessSettingsState.data.logo;return logo?`<img src="${esc(logo)}" alt="Current business logo">`:'<span>No logo</span>'}
function renderBusinessSettings(){
 const b=businessSettingsState.data;
 settingsForm.innerHTML=`<div class="business-settings-tabs" role="tablist" aria-label="Settings section">${[['business','Business details'],['logo','Logo'],['defaults','Document defaults']].map(([key,label])=>`<button id="settings-tab-${key}" type="button" role="tab" data-settings-tab="${key}" aria-controls="settings-panel-${key}" aria-selected="${businessSettingsTab===key}" tabindex="${businessSettingsTab===key?'0':'-1'}">${label}</button>`).join('')}</div>
 <section id="settings-panel-business" class="business-settings-panel" role="tabpanel" aria-labelledby="settings-tab-business" ${businessSettingsTab==='business'?'':'hidden'}><h2>Business details</h2><div class="business-settings-grid">${settingsInput('Business name','name','text','required')}${settingsInput('SSM registration number','registration')}<div class="business-settings-field business-settings-full"><label for="settings-address">Business address</label><textarea id="settings-address" name="address" rows="3" maxlength="5000">${esc(b.address)}</textarea></div>${settingsInput('Email','email','email')}${settingsInput('Phone','phone','tel')}</div></section>
 <section id="settings-panel-logo" class="business-settings-panel" role="tabpanel" aria-labelledby="settings-tab-logo" ${businessSettingsTab==='logo'?'':'hidden'}><h2>Document logo</h2><div class="business-logo-row"><div id="business-logo-preview" class="business-logo-preview">${settingsLogoMarkup()}</div><div class="business-logo-controls"><h3>Business logo</h3><div class="business-logo-buttons"><button id="choose-business-logo" class="secondary" type="button">${b.logo?'Change logo':'Add logo'}</button><button id="remove-logo" type="button">Remove</button></div><input id="logo" class="file-picker-input" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" tabindex="-1" aria-hidden="true"><p class="business-settings-hint">PNG, JPEG or WebP · up to 1 MB</p><p id="business-logo-error" class="business-settings-error" role="alert" hidden></p><button id="dismiss-logo-error" type="button" class="business-settings-text-button" hidden>Dismiss failed selection</button></div></div><p class="business-logo-note">Used in the header of invoices and receipts.</p></section>
 <section id="settings-panel-defaults" class="business-settings-panel" role="tabpanel" aria-labelledby="settings-tab-defaults" ${businessSettingsTab==='defaults'?'':'hidden'}><h2>Document defaults</h2><div class="business-settings-grid"><div class="business-settings-field"><label for="settings-setupChargeMyr">Setup per piece · MYR</label><div class="business-rate-input"><span>RM</span><input id="settings-setupChargeMyr" name="setupChargeMyr" type="number" value="${esc(b.setupChargeMyr)}" min="0" max="100000" step="0.01" inputmode="decimal" required></div></div><div class="business-settings-field"><label for="settings-setupChargeUsd">Setup per piece · USD</label><div class="business-rate-input"><span>US$</span><input id="settings-setupChargeUsd" name="setupChargeUsd" type="number" value="${esc(b.setupChargeUsd)}" min="0" max="100000" step="0.01" inputmode="decimal" required></div></div></div><p class="business-settings-hint">Calculated automatically from the number of item pieces.</p><div class="business-rate-example"><span>Example setup charge</span><strong id="settings-rate-example"></strong></div><div class="business-settings-field business-currency-field"><label for="settings-currency">Default currency</label><select id="settings-currency" name="currency"><option value="MYR" ${b.currency==='MYR'?'selected':''}>RM · Malaysian ringgit</option><option value="USD" ${b.currency==='USD'?'selected':''}>US$ · US dollar</option></select></div><div class="business-settings-field"><label for="settings-payment">Default payment instructions</label><textarea id="settings-payment" name="payment" rows="4" maxlength="5000">${esc(b.payment)}</textarea></div></section>
 <div class="business-settings-savebar"><span id="business-settings-status" role="status" aria-live="polite"></span><div><button id="discard-business-settings" type="button" class="business-settings-text-button" hidden>Discard changes</button><button id="save-business-settings" type="submit" class="primary">Save changes</button></div></div><p id="business-settings-error" class="business-settings-error" role="alert" hidden></p><button id="reload-business-settings" type="button" class="secondary" hidden>Load latest & discard edits</button><p id="business-settings-message" class="business-settings-hint" role="status"></p>`;
 updateBusinessSettingsUI();
}
function setBusinessSettingsTab(tab,focus=false){
 if(!['business','logo','defaults'].includes(tab))return;businessSettingsTab=tab;
 settingsForm.querySelectorAll('[data-settings-tab]').forEach(button=>{const active=button.dataset.settingsTab===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
 for(const key of ['business','logo','defaults'])$('#settings-panel-'+key).hidden=key!==tab;
 if(focus)$('#settings-tab-'+tab).focus();
}
function updateBusinessSettingsUI(){
 if(!businessSettingsState||!$('#save-business-settings'))return;
 const state=businessSettingsState,dirty=settingsDirty(),locked=state.busy||!cloudReady;
 settingsForm.querySelectorAll('input,textarea,select').forEach(input=>input.disabled=locked);
 settingsForm.querySelectorAll('[data-settings-tab]').forEach(button=>button.disabled=state.busy);
 $('#save-business-settings').disabled=locked||!dirty||state.logoReading||!!state.logoError||state.stale;
 $('#save-business-settings').textContent=state.busy?'Saving…':'Save changes';
 $('#discard-business-settings').hidden=!dirty&&!state.logoError;$('#discard-business-settings').disabled=locked||state.logoReading;
 $('#choose-business-logo').disabled=locked||state.logoReading;
 $('#choose-business-logo').textContent=state.logoReading?'Preparing logo…':state.data.logo?'Change logo':'Add logo';
 $('#remove-logo').disabled=locked||state.logoReading||(!state.data.logo&&!state.logoError);
 $('#business-logo-preview').innerHTML=settingsLogoMarkup();$('#business-logo-preview').classList.toggle('business-logo-empty',!state.data.logo);
 $('#business-logo-error').textContent=state.logoError;$('#business-logo-error').hidden=!state.logoError;$('#dismiss-logo-error').hidden=!state.logoError;$('#dismiss-logo-error').disabled=locked;
 $('#business-settings-status').textContent=!cloudReady?'Connecting workspace…':state.busy?'Saving changes…':state.logoReading?'Preparing logo…':dirty?'Unsaved changes':'Saved';
 $('#business-settings-status').classList.toggle('business-settings-dirty',dirty);
 $('#business-settings-error').textContent=state.error;$('#business-settings-error').hidden=!state.error;
 $('#reload-business-settings').hidden=!state.stale;$('#reload-business-settings').disabled=locked;
 $('#business-settings-message').textContent=state.message;
 const currency=state.data.currency,rate=Number(state.data[currency==='USD'?'setupChargeUsd':'setupChargeMyr'])||0,prefix=currency==='USD'?'US$':'RM';$('#settings-rate-example').textContent=`4 pcs × ${prefix} ${rate.toFixed(2)} = ${prefix} ${(rate*4).toFixed(2)}`;
}
function settings(){
 if(!businessSettingsState)adoptBusinessSettings(savedSettingsSnapshot());
 else if(cloudReady&&!settingsDirty()&&!businessSettingsState.busy&&!businessSettingsState.logoReading&&!businessSettingsState.logoError)adoptBusinessSettings(savedSettingsSnapshot());
 renderBusinessSettings();
}
function refreshBusinessSettings(){
 if(!businessSettingsState)return;
 const state=businessSettingsState,snapshot=savedSettingsSnapshot();
 if(state.busy||state.logoReading)return;
 if(!settingsDirty()&&!state.logoError){if(snapshot.revision!==state.revision||settingsFingerprint(snapshot.data)!==settingsFingerprint(state.saved)){adoptBusinessSettings(snapshot);if(!$('#settings').hidden)renderBusinessSettings()}}
 else if(snapshot.revision!==state.revision){state.stale=true;state.error='Business settings changed in another session. Your edits are kept here. Load the latest settings before saving.'}
 updateBusinessSettingsUI();
}
function invalidBusinessSettings(data){
 const textKeys=['name','registration','address','phone','payment','terms'];
 for(const key of textKeys)if(typeof data[key]!=='string'||data[key].length>5000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data[key]))return {key:settingsFields[key]?key:'name',message:'Check text fields: maximum 5,000 characters and no control characters.'};
 if(!data.name.trim())return {key:'name',message:'Enter your business name.'};
 if(typeof data.email!=='string'||data.email.length>254||data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))return {key:'email',message:'Enter a valid email address.'};
 for(const key of ['setupChargeMyr','setupChargeUsd'])if(data[key]===''||!Number.isFinite(Number(data[key]))||Number(data[key])<0||Number(data[key])>100000)return {key,message:'Enter a setup rate between 0 and 100,000.'};
 if(!['MYR','USD'].includes(data.currency))return {key:'currency',message:'Choose RM or US dollar.'};
 if(!InvoiceCore.validImage(data.logo))return {key:'logo',message:'Choose a valid PNG, JPEG or WebP logo up to 1 MB.'};
 return null;
}
async function prepareBusinessLogo(file){
 const extensions={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'},extension=/\.([^.]+)$/.exec(file.name||'')?.[1]?.toLowerCase(),type=file.type==='image/jpg'?'image/jpeg':file.type||extensions[extension];
 if(!['image/png','image/jpeg','image/webp'].includes(type)||!file.size||file.size>1048576)throw Error('Choose a PNG, JPEG or WebP logo up to 1 MB.');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this logo. Choose it again.'));reader.onabort=()=>reject(Error('Reading the logo was interrupted. Choose it again.'));reader.readAsDataURL(file)});
 const source='data:'+type+';base64,'+String(data).split(',')[1];if(!InvoiceCore.validImage(source))throw Error('This is not a valid PNG, JPEG or WebP logo. Choose another file.');
 await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth&&image.naturalHeight&&image.naturalWidth*image.naturalHeight<=40000000?resolve():reject(Error('Choose a logo under 40 megapixels.'));image.onerror=()=>reject(Error('This logo could not be opened. Choose another image.'));image.src=source});
 return source;
}
settingsForm.oninput=event=>{
 const input=event.target;if(!businessSettingsState||businessSettingsState.busy||!cloudReady||!Object.hasOwn(settingsFields,input.name)||input.name==='logo')return;
 businessSettingsState.data[input.name]=input.value;businessSettingsState.message='';if(!businessSettingsState.stale)businessSettingsState.error='';updateBusinessSettingsUI();
};
settingsForm.onchange=async event=>{
 const input=event.target;if(input.id!=='logo'){if(input.tagName==='SELECT')settingsForm.oninput(event);return}
 const file=input.files[0];if(!file||businessSettingsState.busy)return;const request=++businessLogoRequest;businessSettingsState.logoReading=true;businessSettingsState.logoError='';updateBusinessSettingsUI();
 try{const image=await prepareBusinessLogo(file);if(request!==businessLogoRequest)return;businessSettingsState.data.logo=image;businessSettingsState.message=''}catch(error){if(request===businessLogoRequest)businessSettingsState.logoError=error.message||'Could not prepare this logo.'}finally{input.value='';if(request===businessLogoRequest){businessSettingsState.logoReading=false;updateBusinessSettingsUI()}}
};
async function reloadBusinessSettings(){
 if(businessSettingsState.busy||businessSettingsState.logoReading)return;
 businessSettingsState.busy=true;updateBusinessSettingsUI();
 try{await refreshCloud();++businessLogoRequest;adoptBusinessSettings(savedSettingsSnapshot());businessSettingsState.message='Saved settings loaded.';renderBusinessSettings()}catch(error){businessSettingsState.busy=false;businessSettingsState.error=error.message||'Could not load saved settings.';updateBusinessSettingsUI()}
}
settingsForm.onclick=event=>{
 const button=event.target.closest('button');if(!button||!businessSettingsState||businessSettingsState.busy)return;
 if(button.dataset.settingsTab){setBusinessSettingsTab(button.dataset.settingsTab);return}
 if(button.id==='choose-business-logo')$('#logo').click();
 if(button.id==='remove-logo'){++businessLogoRequest;businessSettingsState.data.logo='';businessSettingsState.logoError='';businessSettingsState.message='';updateBusinessSettingsUI()}
 if(button.id==='dismiss-logo-error'){businessSettingsState.logoError='';updateBusinessSettingsUI()}
 if(button.id==='reload-business-settings')reloadBusinessSettings();
 if(button.id==='discard-business-settings'){
  if(businessSettingsState.stale||businessSettingsState.pending){reloadBusinessSettings();return}
  ++businessLogoRequest;const snapshot={data:businessSettingsState.saved,revision:businessSettingsState.revision};adoptBusinessSettings(snapshot);businessSettingsState.message='Changes discarded.';renderBusinessSettings();
 }
};
settingsForm.onkeydown=event=>{
 const button=event.target.closest('[data-settings-tab]');if(!button||businessSettingsState?.busy||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
 const tabs=['business','logo','defaults'],index=tabs.indexOf(businessSettingsTab),next=event.key==='Home'?'business':event.key==='End'?'defaults':tabs[(index+(event.key==='ArrowRight'?1:2))%3];setBusinessSettingsTab(next,true);
};
settingsForm.onsubmit=async event=>{
 event.preventDefault();const state=businessSettingsState;if(!state||state.busy)return;
 if(!cloudReady){state.error='Connecting to the workspace. Try again shortly.';updateBusinessSettingsUI();return}
 if(state.stale||state.logoReading||state.logoError)return;
 const invalid=invalidBusinessSettings(state.data);if(invalid){setBusinessSettingsTab(settingsFields[invalid.key]);state.error=invalid.message;updateBusinessSettingsUI();(invalid.key==='logo'?$('#choose-business-logo'):$('#settings-'+invalid.key))?.focus();return}
 if(!settingsDirty())return;
 const candidate={...structuredClone(state.data),setupChargeMyr:Number(state.data.setupChargeMyr),setupChargeUsd:Number(state.data.setupChargeUsd)};
 if(!InvoiceCore.validBusiness(candidate)){state.error='Check the business details and logo.';updateBusinessSettingsUI();return}
 const payload={business:candidate,revision:state.revision},key=JSON.stringify(payload);
 if(!state.pending||state.pending.key!==key)state.pending={key,payload,operationId:crypto.randomUUID()};const pending=state.pending;state.busy=true;state.error='';state.message='';updateBusinessSettingsUI();
 try{
  const result=await api('settings',{...pending.payload,operationId:pending.operationId});
  if(!result.settings||!Number.isInteger(result.settings.revision)||!InvoiceCore.validBusiness(result.settings.data))throw Error('Could not verify the saved settings. Retry Save changes.');
  const saved=normalizeBusinessSettings(result.settings.data);cloud.settings={...result.settings,data:structuredClone(saved)};db.business=structuredClone(saved);
  adoptBusinessSettings({data:saved,revision:result.settings.revision});businessSettingsState.message='Business settings saved.';persist();
  // Saved documents retain their snapshot; linked orders retain their submitted rate.
  if(!doc.revision&&!doc.status){doc.business=structuredClone(saved);doc.payment=saved.payment;doc.terms=saved.terms;if(!doc.orderId&&!doc.sourceInvoice){doc.setupChargeRate=chargeRate(doc.currency);syncSetupCharge()}render()}
  renderBusinessSettings();toast('Business settings saved.');refreshCloud().catch(()=>{businessSettingsState.message='Settings saved. Workspace refresh is pending.';updateBusinessSettingsUI()});
 }catch(error){
  state.busy=false;if(error.status&&error.status<500)state.pending=null;
  if(error.status===409){state.stale=true;state.error='Business settings changed in another session. Your edits are kept here. Load the latest settings before saving.'}else state.error=error.message||'Could not save changes. Retry Save changes.';
  updateBusinessSettingsUI();
 }
};
