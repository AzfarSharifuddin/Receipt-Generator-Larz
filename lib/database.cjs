require('./config.cjs');
const fs=require('node:fs'),path=require('node:path'),postgres=require('postgres');
let instance;
module.exports=function database(){if(!instance){if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is missing');instance=postgres(process.env.DATABASE_URL,{ssl:{ca:fs.readFileSync(path.join(__dirname,'../supabase-ca.crt'),'utf8'),rejectUnauthorized:true},max:1,prepare:false,connect_timeout:15,idle_timeout:20,connection:{statement_timeout:15000}})}return instance};
