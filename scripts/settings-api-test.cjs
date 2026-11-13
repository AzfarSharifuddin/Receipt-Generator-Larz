const assert=require('node:assert/strict'),crypto=require('node:crypto');
// Isolate shared settings: this test never connects to Supabase.
const initial={name:'TEST business',registration:'',address:'',email:'orders@example.com',phone:'',logo:'',currency:'MYR',payment:'',terms:'',setupChargeMyr:2.5,setupChargeUsd:2.5};
let settings={data:initial,revision:1},writes=0;
const operations=new Map(),user={id:crypto.randomUUID()};
async function sql(strings,...values){
 const query=strings.join('?').replace(/\s+/g,' ').trim();
 if(query.includes('pg_advisory_xact_lock'))return [];
 if(query.startsWith('select * from larz.operations'))return operations.has(values[0])?[structuredClone(operations.get(values[0]))]:[];
 if(query.startsWith('select * from larz.settings'))return [structuredClone(settings)];
 if(query.startsWith('insert into larz.settings')){writes++;settings={data:structuredClone(values[0]),revision:settings.revision+1};return [structuredClone(settings)]}
 if(query.startsWith('insert into larz.operations')){const [id,actor,action,payload_hash,result]=values;operations.set(id,{actor,action,payload_hash,result:structuredClone(result)});return []}
 throw Error('Unexpected SQL in isolated settings test: '+query);
}
sql.json=value=>value;sql.begin=callback=>callback(sql);
require.cache[require.resolve('../lib/database.cjs')]={id:require.resolve('../lib/database.cjs'),filename:require.resolve('../lib/database.cjs'),loaded:true,exports:()=>sql};
const inventory=require('../lib/inventory.cjs');
(async()=>{
 const input={business:{...initial,name:'Updated business',setupChargeMyr:3},revision:1,operationId:crypto.randomUUID()};
 const result=await inventory.mutate('settings',input,user);
 assert.equal(result.settings.revision,2);assert.deepEqual(result.settings.data,input.business);assert.equal(writes,1);
 assert.deepEqual(await inventory.mutate('settings',input,user),result);assert.equal(writes,1);
 await assert.rejects(inventory.mutate('settings',{...input,business:{...initial,name:'Stale overwrite'},operationId:crypto.randomUUID()},user),error=>error.status===409);
 assert.equal(settings.data.name,'Updated business');assert.equal(writes,1);
 await assert.rejects(inventory.mutate('settings',{...input,revision:2,business:{...initial,logo:'data:image/svg+xml;base64,PHN2Zz4='},operationId:crypto.randomUUID()},user),error=>error.status===400);
 await assert.rejects(inventory.mutate('settings',{...input,revision:2,business:{...initial,setupChargeMyr:-1},operationId:crypto.randomUUID()},user),error=>error.status===400);
 assert.equal(writes,1);
 console.log('Settings API passed: authoritative save, idempotent retry, stale-write rejection and input validation (isolated database).');
})().catch(error=>{console.error(error);process.exitCode=1});
