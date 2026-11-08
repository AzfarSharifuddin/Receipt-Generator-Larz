const assert=require('node:assert/strict'),crypto=require('node:crypto'),turnstile=require('../lib/turnstile.cjs');
const originalFetch=global.fetch,originalDocument=global.document,originalProvider=global.turnstile;
const names=['TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','TURNSTILE_HOSTNAMES','VERCEL','NODE_ENV','ORDER_RATE_SECRET'];
const originalEnv=Object.fromEntries(names.map(name=>[name,process.env[name]]));
const context={hostname:'orders-test.example',ip:'127.0.0.1',submissionId:crypto.randomUUID()};
function configured(){process.env.VERCEL='1';process.env.NODE_ENV='production';process.env.TURNSTILE_SITE_KEY='mock-production-site-key';process.env.TURNSTILE_SECRET_KEY='mock-production-private-key';process.env.TURNSTILE_HOSTNAMES=context.hostname}
(async()=>{try{
 for(const name of names)delete process.env[name];
 assert.equal(turnstile.publicConfig('127.0.0.1').ready,true);assert.equal(turnstile.publicConfig('orders-test.example').ready,false);
 process.env.NODE_ENV='production';assert.equal(turnstile.publicConfig('127.0.0.1').ready,false);
 let requests=[];
 global.fetch=async(url,options)=>{requests.push({url,payload:JSON.parse(options.body)});return Response.json({success:true,hostname:context.hostname,action:'public_order'})};
 await assert.rejects(()=>turnstile.verify('token',context),error=>error.publicCode==='TURNSTILE_UNAVAILABLE');assert.equal(requests.length,0);
 configured();const config=turnstile.publicConfig(context.hostname);assert(config.ready);assert(!JSON.stringify(config).includes(process.env.TURNSTILE_SECRET_KEY));assert(!turnstile.publicConfig('foreign.example').ready);
 await assert.rejects(()=>turnstile.verify('',context),error=>error.publicCode==='TURNSTILE_REQUIRED');await assert.rejects(()=>turnstile.verify('x'.repeat(2049),context),error=>error.status===400);assert.equal(requests.length,0);
 await turnstile.verify('test-response',context);await turnstile.verify('test-response',context);assert.equal(requests.length,2);assert.equal(requests[0].url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(requests[0].payload.idempotency_key,requests[1].payload.idempotency_key);assert.match(requests[0].payload.idempotency_key,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(turnstile.verificationId(crypto.randomUUID(),'test-response'),requests[0].payload.idempotency_key);
 for(const result of [{success:false,'error-codes':['timeout-or-duplicate']},{success:true,hostname:'foreign.example',action:'public_order'},{success:true,hostname:context.hostname,action:'different_form'}]){global.fetch=async()=>Response.json(result);await assert.rejects(()=>turnstile.verify('test-response',context),error=>error.publicCode==='TURNSTILE_FAILED')}
 for(const provider of [async()=>{throw Error('offline')},async()=>new Response('unavailable',{status:503}),async()=>new Response('invalid JSON')]){global.fetch=provider;await assert.rejects(()=>turnstile.verify('test-response',context),error=>error.status===503)}
 // Reject failed challenges before entering the order transaction.
 process.env.ORDER_RATE_SECRET='unit-test-order-signing';const value=(Date.now()-2000)+'.'+crypto.randomBytes(16).toString('hex'),token=value+'.'+crypto.createHmac('sha256',process.env.ORDER_RATE_SECRET).update(value).digest('hex');
 global.fetch=async()=>Response.json({success:false});
 await assert.rejects(()=>require('../lib/orders.cjs').submit({submissionId:context.submissionId,business:'TEST',phone:'+60123456789',email:'',delivery:'pickup',address:{street:'',postcode:'',city:'',state:'',country:''},items:[{productId:crypto.randomUUID(),qty:1}],website:'',token,turnstileToken:'failed-response'},context),error=>error.publicCode==='TURNSTILE_FAILED');
 process.env.TURNSTILE_SITE_KEY='1x00000000000000000000AA';process.env.TURNSTILE_SECRET_KEY='1x0000000000000000000000000000000AA';process.env.TURNSTILE_HOSTNAMES='127.0.0.1';assert(!turnstile.publicConfig('127.0.0.1').ready);
 // Frontend lifecycle: fail closed, load failures, expiry, retry and stale callbacks.
 const OrderVerification=require('../order-verification.js');let script,parameters,removed=0,reset=0,changes=0;
 global.document={createElement:()=>({remove(){}}),head:{append(value){script=value}}};delete global.turnstile;
 const status={},retry={},ui=new OrderVerification({container:{clientWidth:280},status,retry,onChange:()=>changes++});
 ui.configure({ready:false});assert.equal(ui.token,'');assert.match(status.textContent,/unavailable/);
 ui.configure({ready:true,siteKey:'public-site-key'});assert.match(script.src,/^https:\/\/challenges\.cloudflare\.com\//);script.onerror();assert.equal(retry.hidden,false);
 global.turnstile={render(element,options){parameters=options;return 'test-widget'},reset(){reset++},remove(){removed++}};
 retry.onclick();assert.equal(parameters.action,'public_order');assert.equal(parameters.size,'compact');assert.equal(parameters['response-field'],false);
 parameters.callback('verified-token');assert.equal(ui.token,'verified-token');parameters['expired-callback']();assert.equal(ui.token,'');ui.reset();assert.equal(reset,1);parameters.callback('another-token');ui.destroy();parameters.callback('stale-token');assert.equal(ui.token,'');assert.equal(removed,1);assert(changes>0);
 console.log('Turnstile checks passed: production configuration, dummy-key rejection, token bounds, provider verification, hostname/action, safe verification retries, failures before order writes, widget loading, expiry, reset and stale callbacks.');
}finally{global.fetch=originalFetch;for(const name of names){if(originalEnv[name]===undefined)delete process.env[name];else process.env[name]=originalEnv[name]}if(originalDocument===undefined)delete global.document;else global.document=originalDocument;if(originalProvider===undefined)delete global.turnstile;else global.turnstile=originalProvider}})().catch(error=>{console.error(error.message);process.exitCode=1});
