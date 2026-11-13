const assert=require('node:assert/strict'),orders=require('../lib/orders.cjs'),auth=require('../lib/auth.cjs');
let submissions=0,limited=false;
orders.rateLimit=async()=>{if(limited)throw Object.assign(Error('Too many requests'),{status:429})};orders.catalog=async()=>({products:[],setupRate:2.5,token:'test'});orders.submit=async()=>{submissions++;return {reference:'ORD-TEST'}};orders.list=async()=>({orders:[],pending:0,total:0});auth.user=async req=>req.headers.cookie==='test-session'?{id:'test-user'}:null;
const server=require('../server.cjs');
server.listen(0,'127.0.0.1',async()=>{try{
 const base='http://127.0.0.1:'+server.address().port;
 for(const path of ['/order','/order.css','/order.js','/order-verification.js','/api/public/catalog'])assert.equal((await fetch(base+path,{redirect:'manual'})).status,200);
 for(const path of ['/api/state','/api/orders','/api/public/anything'])assert.equal((await fetch(base+path,{redirect:'manual'})).status,401);
 for(const asset of ['/src/orders.js','/src/orders.css']){assert.equal((await fetch(base+asset,{redirect:'manual'})).status,303);assert.equal((await fetch(base+asset,{headers:{cookie:'test-session'}})).status,200)}
 assert.equal((await fetch(base+'/api/orders',{headers:{cookie:'test-session'}})).status,200);
 const publicPolicy=(await fetch(base+'/order')).headers.get('content-security-policy');assert(publicPolicy.includes('frame-src https://challenges.cloudflare.com'));assert(publicPolicy.includes("script-src 'self' https://challenges.cloudflare.com"));const privatePolicy=(await fetch(base+'/login')).headers.get('content-security-policy');assert(!privatePolicy.includes('challenges.cloudflare.com'));
 const post=(body,origin=base,type='application/json')=>fetch(base+'/api/public/orders',{method:'POST',headers:{origin,'Content-Type':type},body});
 assert.equal((await post('{}','https://foreign.example')).status,403);assert.equal((await post('{}',base,'text/plain')).status,415);assert.equal((await post('{')).status,400);assert.equal((await post('x'.repeat(25000))).status,413);assert.equal(submissions,0);
 assert.equal((await post('{}')).status,200);assert.equal(submissions,1);limited=true;assert.equal((await post('{}')).status,429);assert.equal(submissions,1);
 console.log('Public order route checks passed: public assets, private employee data, origin, content type, body limit, malformed JSON and rate limits.');
}catch(error){console.error(error.message);process.exitCode=1}finally{server.close()}});
