function revenueDateDefaults(){
 const end=new Date(),start=new Date(end.getFullYear(),end.getMonth()-5,1);
 const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 if(!$('#revenue-from').value)$('#revenue-from').value=iso(start);
 if(!$('#revenue-to').value)$('#revenue-to').value=iso(end);
}
function revenueMoney(cents,currency){
 return `${currency==='MYR'?'RM':'US$'} ${(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
function renderRevenue(){
 const from=$('#revenue-from').value,to=$('#revenue-to').value,currency=$('#revenue-currency').value;
 if(!from||!to||from>to){$('#revenue-summary').innerHTML='<p class="revenue-empty">Choose a valid date range.</p>';$('#revenue-chart').innerHTML='';return}
 const rangeStart=new Date(from+'T12:00:00'),rangeEnd=new Date(to+'T12:00:00');
 const monthSpan=(rangeEnd.getFullYear()-rangeStart.getFullYear())*12+rangeEnd.getMonth()-rangeStart.getMonth()+1;
 if(monthSpan>60){$('#revenue-summary').innerHTML='<p class="revenue-empty">Choose a date range of five years or less.</p>';$('#revenue-chart').innerHTML='';return}
 const all=cloud.documents.filter(d=>d.currency===currency&&!['cancelled','legacy','local'].includes(d.status));
 const sales=all.filter(d=>d.status==='confirmed'&&!d.sourceInvoice);
 const receipts=all.filter(d=>d.type==='receipt'&&d.sourceInvoice&&d.status!=='cancelled');
 const inRange=date=>typeof date==='string'&&date>=from&&date<=to;
 const saleRange=sales.filter(d=>inRange(d.date));
 const salesTotal=saleRange.reduce((sum,d)=>sum+InvoiceCore.totals(d).total,0);
 const linkedByInvoice=new Map();
 for(const receipt of receipts)linkedByInvoice.set(receipt.sourceInvoice,(linkedByInvoice.get(receipt.sourceInvoice)||0)+InvoiceCore.totals(receipt).paid);
 const invoiceRange=saleRange.filter(d=>d.type==='invoice');
 const outstanding=invoiceRange.reduce((sum,d)=>sum+Math.max(0,InvoiceCore.totals(d).total-InvoiceCore.totals(d).paid-(linkedByInvoice.get(d.id)||0)),0);
 const collections=[];
 for(const d of sales){const amount=InvoiceCore.totals(d).paid;if(amount>0)collections.push({date:d.paymentDate||d.date,amount})}
 for(const d of receipts){const amount=InvoiceCore.totals(d).paid;if(amount>0)collections.push({date:d.paymentDate||d.date,amount})}
 const collected=collections.filter(x=>inRange(x.date)).reduce((sum,x)=>sum+x.amount,0);
 $('#revenue-summary').innerHTML=[
  ['Sales',salesTotal,`${saleRange.length} confirmed ${saleRange.length===1?'sale':'sales'}`],
  ['Collected',collected,'Recorded payments in selected period'],
  ['Outstanding',outstanding,`${invoiceRange.length} confirmed ${invoiceRange.length===1?'invoice':'invoices'} issued in period`]
 ].map(([label,value,note])=>`<article class="revenue-metric"><span>${label}</span><strong>${revenueMoney(value,currency)}</strong><small>${note}</small></article>`).join('');
 const months=[];let cursor=new Date(rangeStart.getFullYear(),rangeStart.getMonth(),1),last=new Date(rangeEnd.getFullYear(),rangeEnd.getMonth(),1);
 while(cursor<=last&&months.length<60){months.push({key:`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`,label:cursor.toLocaleDateString('en',{month:'short',year:'2-digit'}),sales:0,collected:0});cursor.setMonth(cursor.getMonth()+1)}
 const monthMap=new Map(months.map(m=>[m.key,m]));
 for(const d of saleRange){const bucket=monthMap.get(d.date.slice(0,7));if(bucket)bucket.sales+=InvoiceCore.totals(d).total}
 for(const payment of collections){if(!inRange(payment.date))continue;const bucket=monthMap.get(payment.date.slice(0,7));if(bucket)bucket.collected+=payment.amount}
 $('#revenue-chart').innerHTML=renderRevenueChart(months,currency);
}
function renderRevenueChart(months,currency){
 if(!months.length)return '<p class="revenue-empty">No data for this period.</p>';
 const W=960,H=330,left=66,right=24,top=26,bottom=54,plotW=W-left-right,plotH=H-top-bottom;
 const maxValue=Math.max(100,...months.flatMap(m=>[m.sales,m.collected])),step=maxValue/4,n=months.length,groupW=plotW/n,barW=Math.min(32,groupW*.28);
 const y=value=>top+plotH-(value/maxValue)*plotH,compact=value=>(value/100).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:1});
 const grid=Array.from({length:5},(_,i)=>{const value=step*(4-i),yy=top+i*plotH/4;return `<g><line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" class="chart-grid"/><text x="${left-10}" y="${yy+4}" text-anchor="end" class="chart-axis">${compact(value)}</text></g>`}).join('');
 const bars=months.map((month,i)=>{const center=left+groupW*(i+.5),salesY=y(month.sales),paidY=y(month.collected),salesHeight=top+plotH-salesY,paidHeight=top+plotH-paidY;return `<g><rect x="${center-barW-3}" y="${salesY}" width="${barW}" height="${salesHeight}" rx="4" class="chart-sales"><title>${month.label} sales: ${revenueMoney(month.sales,currency)}</title></rect><rect x="${center+3}" y="${paidY}" width="${barW}" height="${paidHeight}" rx="4" class="chart-collected"><title>${month.label} collected: ${revenueMoney(month.collected,currency)}</title></rect><text x="${center}" y="${H-20}" text-anchor="middle" class="chart-axis">${month.label}</text></g>`}).join('');
 const label=currency==='MYR'?'Malaysian ringgit':'US dollars';
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly sales and collected payments in ${label}"><title>Monthly revenue trend</title>${grid}${bars}</svg>`;
}
revenueDateDefaults();
$('#revenue-currency').onchange=renderRevenue;
$('#revenue-from').onchange=renderRevenue;
$('#revenue-to').onchange=renderRevenue;
$('#refresh-revenue').onclick=()=>refreshCloud().then(renderRevenue).catch(e=>toast(e.message));
