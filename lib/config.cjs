const fs=require('node:fs'),path=require('node:path');
if(!process.env.VERCEL){for(const name of ['.env.vercel.local','.env.supabase.local']){const p=path.join(__dirname,'..',name);if(fs.existsSync(p))for(const line of fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2')}}}
module.exports=process.env;
