'use strict';
(function(root){
 const core=typeof module!=='undefined'&&module.exports?require('./core.js'):root.InvoiceCore;
 function calendarDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value}
 function report(documents,from,to,currency){
  if(!calendarDate(from)||!calendarDate(to)||from>to)throw Error('Choose a valid date range.');
  if(!['MYR','USD'].includes(currency))throw Error('Choose RM or US dollar.');
  const first=new Date(from+'T12:00:00Z'),last=new Date(to+'T12:00:00Z');
  const span=(last.getUTCFullYear()-first.getUTCFullYear())*12+last.getUTCMonth()-first.getUTCMonth()+1;
  if(span>60)throw Error('Choose a date range of five years or less.');
  const all=documents.filter(d=>d.currency===currency&&d.status==='confirmed');
  const sales=all.filter(d=>!d.sourceInvoice),receipts=all.filter(d=>d.type==='receipt'&&d.sourceInvoice);
  const inRange=date=>calendarDate(date)&&date>=from&&date<=to;
  const saleRange=sales.filter(d=>inRange(d.date)),linked=new Map();
  for(const receipt of receipts)linked.set(receipt.sourceInvoice,(linked.get(receipt.sourceInvoice)||0)+core.totals(receipt).paid);
  const invoices=saleRange.filter(d=>d.type==='invoice');
  const outstanding=invoices.map(d=>({document:d,balance:Math.max(0,core.totals(d).total-core.totals(d).paid-(linked.get(d.id)||0))})).filter(row=>row.balance>0).sort((a,b)=>a.document.date.localeCompare(b.document.date)||String(a.document.number).localeCompare(String(b.document.number)));
  // Linked receipts are collections, never an additional sale.
  const collections=[...sales,...receipts].map(d=>({document:d,date:d.paymentDate||d.date,amount:core.totals(d).paid})).filter(row=>row.amount>0&&inRange(row.date)).sort((a,b)=>b.date.localeCompare(a.date)||String(a.document.number).localeCompare(String(b.document.number)));
  const months=[];for(let n=0;n<span;n++){const date=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+n,1));months.push({key:date.toISOString().slice(0,7),label:date.toLocaleDateString('en',{month:'short',year:'2-digit',timeZone:'UTC'}),sales:0,collected:0})}
  const buckets=new Map(months.map(month=>[month.key,month]));
  for(const d of saleRange)buckets.get(d.date.slice(0,7)).sales+=core.totals(d).total;
  for(const row of collections)buckets.get(row.date.slice(0,7)).collected+=row.amount;
  return {salesTotal:saleRange.reduce((sum,d)=>sum+core.totals(d).total,0),collected:collections.reduce((sum,row)=>sum+row.amount,0),outstandingTotal:outstanding.reduce((sum,row)=>sum+row.balance,0),saleCount:saleRange.length,invoiceCount:invoices.length,collections,outstanding,months};
 }
 root.RevenueData={report,calendarDate};if(typeof module!=='undefined'&&module.exports)module.exports=root.RevenueData;
})(typeof window!=='undefined'?window:globalThis);

let revenueTab='overview',revenueReport=null,revenuePages={payments:1,outstanding:1},revenueLoading=false;
function revenueMoney(cents,currency){return `${currency==='MYR'?'RM':'US$'} ${(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
function revenueDateDefaults(){
 const end=new Date(),start=new Date(end.getFullYear(),end.getMonth()-5,1),iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 $('#revenue-from').value=iso(start);$('#revenue-to').value=iso(end);
}
function setRevenueTab(tab,focus=false){
 if(!['overview','payments','outstanding'].includes(tab))return;revenueTab=tab;
 document.querySelectorAll('[data-revenue-tab]').forEach(button=>{const active=button.dataset.revenueTab===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
 for(const key of ['overview','payments','outstanding'])$('#revenue-panel-'+key).hidden=key!==tab;
 if(focus)$('#revenue-tab-'+tab).focus();
 if(tab==='overview'&&revenueReport)renderRevenueOverview();
}
function renderRevenue(){
 const from=$('#revenue-from').value,to=$('#revenue-to').value,currency=$('#revenue-currency').value;
 $('#revenue-data').hidden=true;$('#revenue-error').hidden=true;
 try{revenueReport=RevenueData.report(cloud.documents,from,to,currency)}catch(error){revenueReport=null;$('#revenue-error').textContent=error.message;$('#revenue-error').hidden=false;return}
 if(!cloudReady){revenueReport=null;return}
 $('#revenue-data').hidden=false;
 $('#revenue-summary').innerHTML=[['Sales',revenueReport.salesTotal,`${revenueReport.saleCount} confirmed ${revenueReport.saleCount===1?'sale':'sales'}`],['Collected',revenueReport.collected,'Payments recorded in period'],['Outstanding',revenueReport.outstandingTotal,'Balance on invoices issued in period']].map(([label,value,note])=>`<article class="revenue-metric"><span>${label}</span><strong>${revenueMoney(value,currency)}</strong><small>${note}</small></article>`).join('');
 $('#revenue-payments-count').textContent=revenueReport.collections.length;$('#revenue-outstanding-count').textContent=revenueReport.outstanding.length;
 renderRevenueList('payments');renderRevenueList('outstanding');setRevenueTab(revenueTab);
}
function renderRevenueOverview(){
 if(!revenueReport)return;
 const currency=$('#revenue-currency').value,months=revenueReport.months,hasData=months.some(month=>month.sales||month.collected);
 $('#revenue-chart-unit').textContent=currency==='MYR'?'RM':'US$';
 $('#revenue-chart').innerHTML=hasData?renderRevenueChart(months,currency):'<p class="revenue-empty">No confirmed sales or recorded payments in this period.</p>';
 $('#revenue-monthly-totals').hidden=!hasData;
 $('#revenue-monthly-rows').innerHTML=months.map(month=>`<tr><th scope="row">${esc(month.label)}</th><td>${revenueMoney(month.sales,currency)}</td><td>${revenueMoney(month.collected,currency)}</td></tr>`).join('');
}
function renderRevenueChart(months,currency){
 const W=Math.max(360,months.length*72+82,Math.floor($('#revenue-chart').getBoundingClientRect().width)),H=280,left=55,right=15,top=18,bottom=36,plotW=W-left-right,plotH=H-top-bottom;
 const maxValue=Math.max(100,...months.flatMap(month=>[month.sales,month.collected])),n=months.length,groupW=plotW/n,barW=Math.min(28,groupW*.28),baseline=top+plotH;
 const y=value=>baseline-value/maxValue*plotH,compact=value=>(value/100).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:1});
 const grid=Array.from({length:5},(_,i)=>{const value=maxValue*(4-i)/4,yy=top+i*plotH/4;return `<g><line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" class="chart-grid"/><text x="${left-9}" y="${yy+4}" text-anchor="end" class="chart-axis">${compact(value)}</text></g>`}).join('');
 const bars=months.map((month,i)=>{const center=left+groupW*(i+.5),salesY=y(month.sales),paidY=y(month.collected);return `<g><rect x="${center-barW-2}" y="${salesY}" width="${barW}" height="${baseline-salesY}" rx="3" class="chart-sales"><title>${esc(month.label)} sales: ${revenueMoney(month.sales,currency)}</title></rect><rect x="${center+2}" y="${paidY}" width="${barW}" height="${baseline-paidY}" rx="3" class="chart-collected"><title>${esc(month.label)} collected: ${revenueMoney(month.collected,currency)}</title></rect><text x="${center}" y="${H-12}" text-anchor="middle" class="chart-axis">${esc(month.label)}</text></g>`}).join('');
 return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly sales and collected payments in ${currency==='MYR'?'Malaysian ringgit':'US dollars'}. Exact values are available in Monthly totals."><title>Monthly trend</title>${grid}${bars}</svg>`;
}
function renderRevenueList(kind){
 const payment=kind==='payments',rows=payment?revenueReport.collections:revenueReport.outstanding,currency=$('#revenue-currency').value,limit=20;
 revenuePages[kind]=Math.min(revenuePages[kind],Math.max(1,Math.ceil(rows.length/limit)));const page=revenuePages[kind],start=(page-1)*limit;
 $('#revenue-'+kind+'-empty').hidden=!!rows.length;$('#revenue-'+kind+'-table').hidden=!rows.length;
 $('#revenue-'+kind+'-rows').innerHTML=rows.slice(start,start+limit).map(row=>{const d=row.document,date=payment?row.date:d.date;return `<tr><td class="revenue-document"><strong>${esc(d.customer)}</strong><span>${esc(d.number)}</span></td><td data-label="${payment?'Payment date':'Issue date'}"><time datetime="${esc(date)}">${esc(savedDocumentDate(date))}</time></td><td data-label="${payment?'Method':'Due date'}">${payment?esc(d.method||'—'):d.due?esc(savedDocumentDate(d.due)):'—'}</td><td class="revenue-amount" data-label="${payment?'Received':'Balance'}">${revenueMoney(payment?row.amount:row.balance,currency)}</td><td class="revenue-row-action"><button type="button" class="secondary" data-revenue-open="${esc(d.id)}">Open<span class="sr-only"> ${esc(d.number)}</span></button></td></tr>`}).join('');
 $('#revenue-'+kind+'-pagination').hidden=rows.length<=limit;$('#revenue-'+kind+'-page').textContent=`${start+1}–${Math.min(start+limit,rows.length)} of ${rows.length}`;
 $('#revenue-'+kind+'-prev').disabled=page<=1;$('#revenue-'+kind+'-next').disabled=page*limit>=rows.length;
}
async function loadRevenue(){
 if(revenueLoading)return;revenueLoading=true;$('#refresh-revenue').disabled=true;$('#revenue-message').textContent='Refreshing revenue…';renderRevenue();
 try{await refreshCloud();renderRevenue();$('#revenue-message').textContent=''}catch(error){$('#revenue-message').textContent=cloudReady?'Could not refresh. Showing previously loaded records.':'Could not load revenue. Try Refresh.'}finally{revenueLoading=false;$('#refresh-revenue').disabled=false}
}
function openRevenueDocument(id){
 const original=cloud.documents.find(d=>d.id===id);if(!original)return toast('This document is no longer available. Refresh revenue.');
 const saved=db.documents.find(d=>d.id===doc.id);if(!InvoiceCore.sameDocumentContent(doc,saved||fresh(doc.type))&&!confirm('Replace the current unfinished changes with this saved document?'))return;
 doc=structuredClone(original);render();draft();show('editor');
}
if(typeof document!=='undefined'){
 revenueDateDefaults();
 for(const key of ['currency','from','to'])$('#revenue-'+key).onchange=()=>{revenuePages={payments:1,outstanding:1};if(key!=='currency')$('#revenue-period').value='custom';renderRevenue()};
 $('#revenue-period').onchange=()=>{const months=Number($('#revenue-period').value);if(!months)return;const end=new Date(),start=new Date(end.getFullYear(),end.getMonth()-months+1,1),iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;$('#revenue-from').value=iso(start);$('#revenue-to').value=iso(end);revenuePages={payments:1,outstanding:1};renderRevenue()};
 $('#refresh-revenue').onclick=loadRevenue;
 document.querySelectorAll('[data-revenue-tab]').forEach(button=>{button.onclick=()=>setRevenueTab(button.dataset.revenueTab);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['overview','payments','outstanding'],index=tabs.indexOf(revenueTab),next=event.key==='Home'?'overview':event.key==='End'?'outstanding':tabs[(index+(event.key==='ArrowRight'?1:2))%3];setRevenueTab(next,true)}});
 for(const kind of ['payments','outstanding'])for(const direction of ['prev','next'])$('#revenue-'+kind+'-'+direction).onclick=()=>{revenuePages[kind]+=direction==='next'?1:-1;renderRevenueList(kind);$('#revenue-tab-'+kind).focus()};
 $('#revenue').addEventListener('click',event=>{const button=event.target.closest('[data-revenue-open]');if(button)openRevenueDocument(button.dataset.revenueOpen)});
 if(typeof ResizeObserver!=='undefined'){let width=0;new ResizeObserver(entries=>{const next=Math.floor(entries[0].contentRect.width);if(next>0&&next!==width){width=next;if(revenueTab==='overview'&&revenueReport&&!$('#revenue').hidden)renderRevenueOverview()}}).observe($('#revenue-chart'))}
}
