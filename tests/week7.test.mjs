import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadModule} from './helpers/load-ts.mjs';
import {ADMIN,USER,privilegedClient,sessionClient,adminLookup} from './helpers/fakes.mjs';
const ID='44444444-4444-4444-8444-444444444444';
const idle={status:'idle',message:''};
const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))if(v!==null)f.set(k,String(v));return f;};
function actions(file,who='admin',respond=()=>({data:{id:ID},error:null})){
 const session=sessionClient({user:who==='anonymous'?null:{id:who==='admin'?ADMIN:USER}});
 const db=privilegedClient(adminLookup(who==='admin',respond));
 const stubs={'server-only':{},'./supabase/server':{createClient:async()=>session.client},'./server':{createClient:async()=>session.client},'./supabase/privileged':{createPrivilegedClient:()=>db.client},'next/navigation':{redirect:path=>{throw new Error('REDIRECT:'+path);}},'next/cache':{revalidatePath(){}}};
 return {module:loadModule(file,stubs),calls:db.calls,db};
}
const inputs={
 terms:{term:'Week 7 disposable',definition:'A test definition.',active:'on'},
 examples:{title:'Week 7 disposable',prompt_example:'A reference for a cat photo.',caption:'My alarm clock has whiskers.',model_id:''},
 models:{name:'Week 7 disposable',model_key:'week7-test',provider_id:ID,active:'on'},
 providers:{name:'Week 7 disposable',slug:'week7-test',active:'on'},
 'signup-domains':{domain:'  TEST.EXAMPLE.EDU ',active:'on'},
 whitelist:{email:'  TEST@EXAMPLE.EDU ',active:'on'},
};
for(const who of ['anonymous','denied'])test(`${who}: all new actions deny access before any data/storage work`,async()=>{
 const c=actions('app/admin/catalog-actions.ts',who);
 for(const entity of Object.keys(inputs)){
 assert.equal((await c.module.saveCatalog(idle,form({entity,...inputs[entity]}))).status,'error');
 assert.equal((await c.module.deleteCatalog(idle,form({entity,id:ID,confirm:'on'}))).status,'error');
 }
 const mix=actions('app/admin/mix/actions.ts',who);assert.equal((await mix.module.saveMix(idle,form({}))).status,'error');
 const image=actions('app/admin/images/actions.ts',who);
 assert.equal((await image.module.registerImage({path:'anything'})).status,'error');
 assert.equal((await image.module.updateImage(idle,form({id:ID,title:'x',alt_text:'x'}))).status,'error');
 assert.equal((await image.module.deleteImage(idle,form({id:ID,confirm:'on'}))).status,'error');
 const activity=actions('app/admin/activity-actions.ts',who);await assert.rejects(activity.module.getActivity(14));
 for(const t of [c,mix,image,activity])assert.ok(t.calls.every(call=>call[0]==='caption_lab_admins'),'no privileged work before gate');
});
for(const [entity,values] of Object.entries(inputs))test(`${entity}: create and update save only allowed columns; delete requires confirmation`,async()=>{
 const t=actions('app/admin/catalog-actions.ts');
 assert.equal((await t.module.saveCatalog(idle,form({entity,...values,sql:'drop table',user_id:USER}))).status,'ok');
 const insert=t.calls.find(c=>c[1]==='insert');assert.ok(insert);assert.ok(!('sql'in insert[2]));assert.ok(!('user_id'in insert[2]));
 if(entity==='signup-domains')assert.equal(insert[2].domain,'test.example.edu');if(entity==='whitelist')assert.equal(insert[2].email,'test@example.edu');
 assert.equal((await t.module.saveCatalog(idle,form({entity,id:ID,...values}))).status,'ok');
 assert.equal((await t.module.deleteCatalog(idle,form({entity,id:ID}))).status,'error');
 assert.equal((await t.module.deleteCatalog(idle,form({entity,id:ID,confirm:'on'}))).status,'ok');
});
test('read-only entities and arbitrary tables never accept mutations',async()=>{
 const t=actions('app/admin/catalog-actions.ts');for(const entity of ['users','profiles','chains','steps','mix','requests','responses','caption_lab_admins','posts']){
 assert.equal((await t.module.saveCatalog(idle,form({entity,id:ID}))).status,'error');assert.equal((await t.module.deleteCatalog(idle,form({entity,id:ID,confirm:'on'}))).status,'error');
 }assert.ok(t.calls.every(c=>c[0]==='caption_lab_admins'));
});
test('duplicates and referenced deletes report useful errors',async()=>{
 for(const code of ['23505','23503']){const t=actions('app/admin/catalog-actions.ts','admin',()=>({error:{code},data:null}));const result=await t.module.deleteCatalog(idle,form({entity:'providers',id:ID,confirm:'on'}));assert.equal(result.status,'error');assert.match(result.message,code==='23505'?/already exists/:/in use/);}
});
test('unsafe values rejected by server validation before CRUD',async()=>{
 const t=actions('app/admin/catalog-actions.ts');for(const [entity,bad] of [['signup-domains',{domain:'https://example.edu'}],['signup-domains',{domain:'a..edu'}],['whitelist',{email:'a@evil@school.edu'}],['examples',{caption:'one two three four five six seven eight nine ten eleven'}],['models',{model_key:'https://evil.test'}]])assert.equal((await t.module.saveCatalog(idle,form({entity,...inputs[entity],...bad}))).status,'error');
 assert.ok(t.calls.every(c=>c[0]==='caption_lab_admins'));
});
test('activity range is validated server-side and both counts use one aggregate',async()=>{
 const t=actions('app/admin/activity-actions.ts');for(const days of [6,91,14.5,'14',null])assert.equal((await t.module.getActivity(days)).status,'error');for(const days of [7,14,30,90]){const result=await t.module.getActivity(days);assert.equal(result.status,'ok');assert.equal(result.activity.length,days);}assert.deepEqual(t.calls.filter(c=>c[0]==='rpc').map(c=>c[2].p_days),[7,14,30,90]);
});
test('calendar buckets stay contiguous through spring and fall DST transitions',()=>{
 const {bucketByDay}=loadModule('lib/data.ts',{'server-only':{}});
 for(const now of ['2026-03-09T04:30:00Z','2026-11-02T05:30:00Z']){const rows=bucketByDay([],[],new Date(now),7);assert.equal(rows.length,7);assert.equal(new Set(rows.map(row=>row.day)).size,7);for(let i=1;i<rows.length;i++)assert.equal((new Date(rows[i].day)-new Date(rows[i-1].day))/86400000,1);}
});
