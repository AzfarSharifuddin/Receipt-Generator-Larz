require('./config.cjs');const database=require('./database.cjs');
async function request(path,options={}){return fetch(process.env.SUPABASE_URL+'/auth/v1'+path,{...options,headers:{apikey:process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)})}
function token(req){const m=/(?:^|;\s*)larz_access=([A-Za-z0-9_.-]+)(?:;|$)/.exec(req.headers.cookie||'');return m?.[1]}
async function member(id){return !!(await database()`select user_id from larz.members where user_id=${id}`)[0]}
async function user(req){const jwt=token(req);if(!jwt)return null;const r=await request('/user',{headers:{Authorization:'Bearer '+jwt}});if(!r.ok)return null;const u=await r.json();return u.id&&await member(u.id)?u:null}
async function login(email,password){const r=await request('/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});if(!r.ok)return null;const session=await r.json();if(!session.user?.id||!await member(session.user.id))return null;return session}
async function logout(req){const jwt=token(req);if(jwt)await request('/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+jwt}})}
module.exports={user,login,logout};
