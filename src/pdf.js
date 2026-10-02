/* Direct A4 export; locally bundled jsPDF, no remote requests. */
async function downloadDocumentPDF(d){
 const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),b=d.business,t=InvoiceCore.totals(d);let y=20;
 const cash=n=>`${d.currency==='MYR'?'RM':'US$'} ${(n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const write=(text,x,at,size=10,align='left')=>{pdf.setFontSize(size);pdf.text(String(text||''),x,at,{align})};
 const line=()=>{pdf.setDrawColor(210);pdf.line(18,y,192,y);y+=7};
 const room=h=>{if(y+h>275){pdf.addPage();y=20}};
 const block=(text,x=18,width=174,size=10)=>{if(!text)return;pdf.setFontSize(size);const lines=pdf.splitTextToSize(String(text),width);for(const row of lines){room(6);write(row,x,y,size);y+=5}y+=2};
 pdf.setTextColor(30);pdf.setFont('helvetica','normal');
 let logoHeight=0;if(b.logo){const properties=pdf.getImageProperties(b.logo);const w=Math.min(38,18*properties.width/properties.height);logoHeight=w*properties.height/properties.width;pdf.addImage(b.logo,18,y,w,logoHeight)}
 write(d.type.toUpperCase(),192,25,23,'right');write(d.number,192,33,10,'right');
 y+=logoHeight?logoHeight+7:0;pdf.setFont('helvetica','bold');block(b.name,18,100,13);pdf.setFont('helvetica','normal');block(b.address,18,100);block(b.email,18,100);
 room(8);write(b.phone,18,y);write('Issue date: '+d.date,192,y,10,'right');y+=7;block(b.registration?'Reg. '+b.registration:'',18,100);y=Math.max(y,48);line();
 block(d.type==='receipt'?'RECEIVED FROM':'BILL TO',18,174,8);pdf.setFont('helvetica','bold');block(d.customer);pdf.setFont('helvetica','normal');block(d.address);block(d.email);if(d.due&&d.type==='invoice')block('Due date: '+d.due);if(d.reference)block('Reference: '+d.reference);y+=3;
 const tableHead=()=>{room(14);pdf.setFillColor(242);pdf.rect(18,y-5,174,9,'F');write('DESCRIPTION',20,y,8);write('QTY',119,y,8,'right');write('RATE',152,y,8,'right');write('AMOUNT',190,y,8,'right');y+=10};tableHead();
 for(const item of d.items){pdf.setFontSize(10);const lines=pdf.splitTextToSize(item.description,85);let first=true;for(let n=0;n<lines.length;){if(y+8>275){pdf.addPage();y=20;tableHead()}const count=Math.min(lines.length-n,Math.max(1,Math.floor((270-y)/5)));if(first){write(item.qty,119,y,10,'right');write(cash(InvoiceCore.round(item.price)),152,y,9,'right');write(cash(InvoiceCore.round(item.qty*item.price)),190,y,9,'right');first=false}for(let j=0;j<count;j++)write(lines[n+j],20,y+j*5);y+=count*5;n+=count}y+=4;pdf.setDrawColor(230);pdf.line(18,y-2,192,y-2)}
 room(55);y+=5;const total=(label,value,bold=false)=>{room(8);pdf.setFont('helvetica',bold?'bold':'normal');write(label,110,y,10);write(cash(value),192,y,10,'right');y+=7};total('Subtotal',t.subtotal);if(t.discount)total('Discount',-t.discount);if(t.tax)total(`Tax (${d.tax}%)`,t.tax);if(d.shipping)total('Additional charge',InvoiceCore.round(d.shipping));total('Total',t.total,true);if(t.paid||d.type==='receipt')total(d.type==='receipt'?'Amount received':'Already paid',t.paid);total(t.balance<0?'Credit balance':'Balance due',Math.abs(t.balance),true);pdf.setFont('helvetica','normal');y+=8;
 if(d.type==='receipt'){block('PAYMENT DETAILS',18,174,8);block([d.paymentDate,d.method,d.paymentReference].filter(Boolean).join(' / '));if(t.balance===0)block('PAID IN FULL')}else if(d.payment){block('PAYMENT INSTRUCTIONS',18,174,8);block(d.payment)}
 if(d.notes||d.terms){room(15);block('NOTES',18,174,8);block([d.notes,d.terms].filter(Boolean).join('\n\n'))}
 const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);write(`${i} / ${pages}`,192,287,8,'right')}
 pdf.save(`${d.number}_${d.customer}`.replace(/[^a-zA-Z0-9 _.-]/g,'_').slice(0,150)+'.pdf');
}
