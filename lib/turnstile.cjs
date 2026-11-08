const crypto=require('node:crypto');
const ACTION='public_order';
const LOCAL_SITE_KEY='1x00000000000000000000AA';
const LOCAL_SECRET_KEY='1x0000000000000000000000000000000AA';
const localHosts=new Set(['localhost','127.0.0.1','[::1]']);
const testKey=value=>/^[123]x0{10,}/.test(value||'');
function fail(message,status,code){throw Object.assign(Error(message),{status,publicCode:code})}
function configuration(hostname){
 hostname=String(hostname||'').toLowerCase();
 const local=!process.env.VERCEL&&process.env.NODE_ENV!=='production'&&localHosts.has(hostname);
 let siteKey=process.env.TURNSTILE_SITE_KEY||'',secretKey=process.env.TURNSTILE_SECRET_KEY||'';
 let hosts=(process.env.TURNSTILE_HOSTNAMES||'').split(',').map(host=>host.trim().toLowerCase()).filter(Boolean);
 // Cloudflare's documented dummy keys are restricted to local development.
 if(local){siteKey=LOCAL_SITE_KEY;secretKey=LOCAL_SECRET_KEY;hosts=[hostname]}
 const localTest=local&&siteKey===LOCAL_SITE_KEY&&secretKey===LOCAL_SECRET_KEY;
 const ready=!!(hostname&&siteKey&&secretKey&&hosts.includes(hostname)&&/^[A-Za-z0-9_-]{10,100}$/.test(siteKey)&&(localTest||!testKey(siteKey)&&!testKey(secretKey)));
 return {siteKey,secretKey,hostname,localTest,ready};
}
function publicConfig(hostname){const config=configuration(hostname);return {ready:config.ready,siteKey:config.ready?config.siteKey:'',action:ACTION}}
function verificationId(submissionId,token){
 const bytes=crypto.createHash('sha256').update(submissionId+'\0'+token).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=bytes.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
async function verify(token,{hostname,ip,submissionId}={}){
 const config=configuration(hostname);
 if(!config.ready)fail('Order submissions are temporarily unavailable. Please try again later.',503,'TURNSTILE_UNAVAILABLE');
 if(typeof token!=='string'||!token.trim()||token.length>2048)fail('Please complete the security verification.',400,'TURNSTILE_REQUIRED');
 const payload={secret:config.secretKey,response:token,idempotency_key:verificationId(submissionId||'',token)};
 if(ip)payload.remoteip=ip;
 let result;
 try{
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Verification unavailable');result=await response.json();
 }catch{fail('Security verification is temporarily unavailable. Please retry.',503,'TURNSTILE_UNAVAILABLE')}
 if(result.success!==true||!config.localTest&&(result.hostname!==config.hostname||result.action!==ACTION))fail('Security verification expired or failed. Please complete it again.',403,'TURNSTILE_FAILED');
}
module.exports={publicConfig,verify,verificationId};
