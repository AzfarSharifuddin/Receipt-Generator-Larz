const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),auth=require('../lib/auth.cjs');
auth.user=async req=>req.headers.cookie==='test-session'?{id:'test-user'}:null;
const server=require('../server.cjs');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(base+'/manifest.webmanifest',{redirect:'manual'});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/manifest\+json/);assert.match(response.headers.get('content-security-policy'),/manifest-src 'self'/);
  const manifest=await response.json();assert.equal(manifest.name,'LARZ');assert.equal(manifest.short_name,'LARZ');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.id,'/');
  const original=fs.readFileSync(path.join(__dirname,'../assets/larz-logo.png'));
  for(const icon of manifest.icons){const image=await fetch(base+icon.src,{redirect:'manual'});assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/^image\/png/);const bytes=Buffer.from(await image.arrayBuffer());assert.equal(bytes.readUInt32BE(16),bytes.readUInt32BE(20));assert.equal(icon.sizes,bytes.readUInt32BE(16)+'x'+bytes.readUInt32BE(20));assert.deepEqual(bytes,original)}
  const apple=await fetch(base+'/apple-touch-icon.png',{redirect:'manual'});assert.equal(apple.status,200);assert.deepEqual(Buffer.from(await apple.arrayBuffer()),original);assert.equal(apple.headers.get('set-cookie'),null);
  const head=await fetch(base+'/apple-touch-icon.png',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  const css=await fetch(base+'/assets/app-shell.css');assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/^text\/css/);
  for(const [url,headers] of [['/login',{}],['/',{cookie:'test-session'}]]){const page=await fetch(base+url,{headers,redirect:'manual'});assert.equal(page.status,200);const html=await page.text();assert.equal((html.match(/rel="manifest"/g)||[]).length,1);assert.match(html,/rel="manifest" href="\/manifest.webmanifest"/);assert.match(html,/rel="apple-touch-icon" href="\/apple-touch-icon.png"/);assert.match(html,/name="apple-mobile-web-app-title" content="LARZ"/);assert.match(html,/name="apple-mobile-web-app-capable" content="yes"/);assert.match(html,/name="viewport" content="[^"]*viewport-fit=cover/);assert(!html.includes('maximum-scale=1'));assert.match(html,/name="csrf" value="[a-f0-9]{64}"/)}
  const root=await fetch(base+'/',{redirect:'manual'});assert.equal(root.status,303);assert.equal(root.headers.get('location'),'/login');assert.equal((await fetch(base+'/api/state')).status,401);assert.equal((await fetch(base+'/src/app.js',{redirect:'manual'})).status,303);
  assert.equal((await fetch(base+'/service-worker.js')).status,404);assert.equal((await fetch(base+'/.env')).status,404);
  const order=await fetch(base+'/order');assert.equal(order.status,200);assert(!(await order.text()).includes('manifest.webmanifest'));
  const deployment=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.json'),'utf8'));assert(deployment.builds[0].config.includeFiles.includes('assets/**'));
  console.log('Web app passed: original company-logo icons, manifest/Apple metadata, public launch assets, signed-out redirect, protected employee data, CSRF and Vercel asset inclusion.');
 }finally{await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
