const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,port=Number(process.env.PORT||4173);
let auth;
if(process.env.AUTH_USERNAME&&process.env.AUTH_PASSWORD_SALT&&process.env.AUTH_PASSWORD_HASH){auth={username:process.env.AUTH_USERNAME,salt:process.env.AUTH_PASSWORD_SALT,hash:process.env.AUTH_PASSWORD_HASH}}
else if(!process.env.VERCEL){try{auth=JSON.parse(fs.readFileSync(path.join(root,'.auth.json'),'utf8'))}catch{}}
if(!auth?.username||!auth.salt||!/^[a-f0-9]{128}$/.test(auth.hash))throw Error('Configure AUTH_USERNAME, AUTH_PASSWORD_SALT, and AUTH_PASSWORD_HASH.');
const secret=process.env.SESSION_SECRET||(!process.env.VERCEL?crypto.randomBytes(32).toString('hex'):'');
if(secret.length<32)throw Error('SESSION_SECRET must be at least 32 characters.');
const secure=process.env.VERCEL||process.env.COOKIE_SECURE==='1';
const attempts=new Map(),ttl=8*60*60*1000;
function sign(value){return crypto.createHmac('sha256',secret).update(value).digest('hex')}
function makeSession(){const value=`${Date.now()+ttl}.${crypto.randomBytes(16).toString('hex')}`;return `${value}.${sign(value)}`}function send(res,status,body,type='text/plain'){res.writeHead(status,{'Content-Type':type});res.end(body)}
function redirect(res,url){res.writeHead(303,{Location:url});res.end()}
function cookie(req){return /(?:^|;\s*)larz_session=([0-9]+\.[a-f0-9]{32}\.[a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]}
function loggedIn(req){const token=cookie(req);if(!token)return false;const [expiry,nonce,mac]=token.split('.');return Number(expiry)>Date.now()&&crypto.timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(sign(`${expiry}.${nonce}`),'hex'))}const publicFiles={'/login':'login.html','/login.css':'login.css','/assets/larz-logo.png':'assets/larz-logo.png'};
const privateFiles={'/':'index.html','/index.html':'index.html','/src/app.js':'src/app.js','/src/core.js':'src/core.js','/src/style.css':'src/style.css'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'){
  if(!['/login','/logout'].includes(url.pathname))return send(res,404,'Not found');
  let body='';try{for await(const chunk of req){body+=chunk;if(body.length>4096)return send(res,413,'Request too large')}}catch{return send(res,400,'Invalid request')}
  const data=new URLSearchParams(body);
  const csrfCookie=/(?:^|;\s*)larz_csrf=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  if(!csrfCookie||data.get('csrf')!==csrfCookie)return send(res,403,'Your form expired. Return to /login and refresh the page.');
  if(url.pathname==='/logout'){res.setHeader('Set-Cookie','larz_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return redirect(res,'/login')}  const ip=process.env.VERCEL?(req.headers['x-forwarded-for']||req.socket.remoteAddress):req.socket.remoteAddress;let rate=attempts.get(ip);if(!rate||rate.until<Date.now()){rate={count:0,until:Date.now()+15*60*1000};attempts.set(ip,rate)}if(rate.count>=10)return send(res,429,'Too many attempts. Try again in 15 minutes.');rate.count++;
  const hash=crypto.scryptSync(data.get('password')||'',auth.salt,64);
  if(data.get('username')!==auth.username||!crypto.timingSafeEqual(hash,Buffer.from(auth.hash,'hex')))return redirect(res,'/login?error=1');
  attempts.delete(ip);
  const token=makeSession();res.setHeader('Set-Cookie',`larz_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl/1000}${secure?'; Secure':''}`);return redirect(res,'/');
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,'Method not allowed');
 if(url.pathname==='/login'&&loggedIn(req))return redirect(res,'/');
 let file=publicFiles[url.pathname];if(!Object.hasOwn(publicFiles,url.pathname)){if(!Object.hasOwn(privateFiles,url.pathname))return send(res,404,'Not found');if(!loggedIn(req))return redirect(res,'/login');file=privateFiles[url.pathname]}
 fs.readFile(path.join(root,file),(err,data)=>{if(err)return send(res,404,'Not found');if(file==='login.html'||file==='index.html'){const csrf=/(?:^|;\s*)larz_csrf=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||crypto.randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`larz_csrf=${csrf}; HttpOnly; SameSite=Strict; Path=/${secure?'; Secure':''}`);data=Buffer.from(data.toString().replace(/(<form\b[^>]*method="post"[^>]*>)/g,`$1<input type="hidden" name="csrf" value="${csrf}">`));}if(file==='login.html')data=Buffer.from(data.toString().replace('<!--ERROR-->',url.searchParams.has('error')?'<p class="error" role="alert">Incorrect ID or password.</p>':''));res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png'})[path.extname(file)]);res.end(req.method==='HEAD'?undefined:data)});
});
if(require.main===module)server.listen(port,'127.0.0.1',()=>console.log(`Larz Studio: http://127.0.0.1:${port}`));
module.exports=server;


