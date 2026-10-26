// Opt-in live integration checks. No AI calls. Only clearly labelled disposable
// records/files are mutated, then removed in finally. Existing mix is restored.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadModule} from './helpers/load-ts.mjs';
if(process.env.RUN_LIVE_WEEK7!=='1')throw new Error('Set RUN_LIVE_WEEK7=1 to run disposable live checks.');
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:membership,error:membershipError}=await db.from('caption_lab_admins').select('user_id').eq('is_superadmin',true).limit(1).single();
assert.ifError(membershipError);assert.ok(membership?.user_id);
// The authentication gate has independent denial tests. Here a known existing
// superadmin context exercises real server validation and real Supabase writes.
class AdminAccessError extends Error{}
const stubs={'server-only':{},'@/lib/auth':{assertAdmin:async()=>({status:'admin',db,user:{id:membership.user_id,email:null}}),AdminAccessError},'next/cache':{revalidatePath(){}}};
const catalog=loadModule('app/admin/catalog-actions.ts',stubs);
const images=loadModule('app/admin/images/actions.ts',stubs);
const mixActions=loadModule('app/admin/mix/actions.ts',stubs);
const idle={status:'idle',message:''};
const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,String(v));return f;};
const label='Week7 disposable '+randomUUID().slice(0,8);const created=[];let imageId,path,mixBefore;
const log=[];
try{
 const tests=[
 ['providers','caption_lab_providers',{name:label,slug:'week7-'+randomUUID().slice(0,8),active:'on'},'name',label],
 ['terms','caption_lab_terms',{term:label,definition:'Disposable integration test only.',active:'on'},'term',label],
 ['signup-domains','caption_lab_signup_domains',{domain:'  '+label.replaceAll(' ','-').toUpperCase()+'.EXAMPLE.EDU  ',active:'on'},'domain',label.replaceAll(' ','-').toLowerCase()+'.example.edu'],
 ['whitelist','caption_lab_whitelist',{email:'  '+label.replaceAll(' ','-').toUpperCase()+'@EXAMPLE.EDU  ',active:'on'},'email',label.replaceAll(' ','-').toLowerCase()+'@example.edu'],
 ];
 for(const [entity,table,values,field,normalized]of tests){
  assert.equal((await catalog.saveCatalog(idle,form({entity,...values}))).status,'ok',entity+' create');
  const {data:row,error}=await db.from(table).select('*').eq(field,normalized).single();assert.ifError(error);created.push({entity,table,id:row.id});assert.equal(row[field],normalized);
  assert.equal((await catalog.saveCatalog(idle,form({entity,id:row.id,...values,active:''}))).status,'ok',entity+' update');
  const reread=await db.from(table).select('active').eq('id',row.id).single();assert.ifError(reread.error);assert.equal(reread.data.active,false);
  assert.equal((await catalog.saveCatalog(idle,form({entity,...values}))).status,'error',entity+' duplicate rejected');
  log.push(entity+' create/read/update/reload/duplicate passed');
 }
 const provider=created.find(r=>r.entity==='providers');
 const modelValues={name:label,model_key:'week7-'+randomUUID().slice(0,8),provider_id:provider.id,active:'on'};
 assert.equal((await catalog.saveCatalog(idle,form({entity:'models',...modelValues}))).status,'ok');
 const model=await db.from('caption_lab_models').select('*').eq('name',label).single();assert.ifError(model.error);created.push({entity:'models',table:'caption_lab_models',id:model.data.id});
 assert.equal((await catalog.saveCatalog(idle,form({entity:'models',id:model.data.id,...modelValues,name:label+' updated'}))).status,'ok');
 assert.equal((await db.from('caption_lab_models').select('name').eq('id',model.data.id).single()).data.name,label+' updated');
 const blocked=await catalog.deleteCatalog(idle,form({entity:'providers',id:provider.id,confirm:'on'}));assert.equal(blocked.status,'error');assert.match(blocked.message,/in use/);
 log.push('models CRUD persistence and referenced provider deletion protection passed');
 const exampleValues={title:label,prompt_example:'Manual reference for a city pigeon image.',caption:'My landlord also accepts breadcrumbs.',model_id:model.data.id};
 assert.equal((await catalog.saveCatalog(idle,form({entity:'examples',...exampleValues}))).status,'ok');
 const example=await db.from('caption_lab_examples').select('*').eq('title',label).single();assert.ifError(example.error);created.push({entity:'examples',table:'caption_lab_examples',id:example.data.id});assert.equal(example.data.origin,'manual_reference');
 assert.equal((await catalog.saveCatalog(idle,form({entity:'examples',id:example.data.id,...exampleValues,caption:'Rent is due in breadcrumbs.'}))).status,'ok');assert.equal((await db.from('caption_lab_examples').select('caption').eq('id',example.data.id).single()).data.caption,'Rent is due in breadcrumbs.');
 assert.equal((await catalog.deleteCatalog(idle,form({entity:'models',id:model.data.id,confirm:'on'}))).status,'error');
 log.push('examples CRUD persistence and referenced model deletion protection passed');
 const m=await db.from('caption_lab_mix').select('chain_id,enabled,weight').order('chain_id');assert.ifError(m.error);mixBefore=m.data;
 const fields=Object.fromEntries(mixBefore.flatMap(r=>[[`weight:${r.chain_id}`,String(r.weight===100?99:r.weight+1)],[`enabled:${r.chain_id}`,r.enabled?'on':'']]));
 assert.equal((await mixActions.saveMix(idle,form(fields))).status,'ok');
 const after=await db.from('caption_lab_mix').select('chain_id,weight').order('chain_id');assert.ifError(after.error);assert.equal(after.data[0].weight,Number(fields[`weight:${after.data[0].chain_id}`]));
 const invalid=structuredClone(mixBefore).map(r=>({...r,enabled:false}));const reject=await db.rpc('caption_lab_save_mix',{p_rows:invalid});assert.ok(reject.error);
 const unchanged=await db.from('caption_lab_mix').select('chain_id,weight').order('chain_id');assert.deepEqual(unchanged.data,after.data);
 log.push('mix update/reload, all-off validation and transaction atomicity passed');
 path=membership.user_id+'/'+randomUUID()+'.png';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZqS8AAAAASUVORK5CYII=','base64');
 const upload=await db.storage.from('week4-media').upload(path,png,{contentType:'image/png',upsert:false});assert.ifError(upload.error);
 assert.equal((await images.registerImage({path,title:label,alt_text:'Disposable one pixel test image.'})).status,'ok');
 const registered=await db.from('caption_lab_images').select('*').eq('storage_path',path).single();assert.ifError(registered.error);imageId=registered.data.id;assert.equal(registered.data.size_bytes,png.length);
 const signed=await db.storage.from('week4-media').createSignedUrl(path,60);assert.ifError(signed.error);assert.equal((await fetch(signed.data.signedUrl)).status,200);
 const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});assert.ok((await anon.storage.from('week4-media').download(path)).error,'unpublished image is private');
 assert.equal((await images.updateImage(idle,form({id:imageId,title:label+' updated',alt_text:'Updated test alt.'}))).status,'ok');assert.equal((await db.from('caption_lab_images').select('alt_text').eq('id',imageId).single()).data.alt_text,'Updated test alt.');
 const deleted=await images.deleteImage(idle,form({id:imageId,confirm:'on'}));assert.equal(deleted.status,'ok',deleted.message);const deletedId=imageId;imageId=null;assert.equal((await db.from('caption_lab_images').select('id').eq('id',deletedId)).data.length,0);const listing=await db.storage.from('week4-media').list(membership.user_id,{search:path.split('/')[1]});assert.ifError(listing.error);assert.equal(listing.data.length,0);path=null;
 log.push('image upload/read/private signed preview/update/reload/delete/file cleanup passed');
 const existing=await db.from('caption_lab_images').select('id').limit(1).single();assert.ifError(existing.error);assert.equal((await images.deleteImage(idle,form({id:existing.data.id,confirm:'on'}))).status,'error');log.push('existing referenced image deletion refused');
 for(const days of [7,14,30,90]){const activity=await db.rpc('caption_lab_activity',{p_days:days});assert.ifError(activity.error);assert.equal(activity.data.length,days);assert.ok(activity.data.every(r=>Number.isInteger(Number(r.captions))&&Number.isInteger(Number(r.votes))));}
 log.push('7/14/30/90-day database chart queries return complete ranges');
}finally{
 if(mixBefore){const restored=await db.rpc('caption_lab_save_mix',{p_rows:mixBefore});assert.ifError(restored.error);}
 if(imageId){const present=await db.from('caption_lab_images').select('id').eq('id',imageId);if(present.data?.length){const result=await images.deleteImage(idle,form({id:imageId,confirm:'on'}));assert.equal(result.status,'ok',result.message);}}else if(path){assert.ifError((await db.storage.from('week4-media').remove([path])).error);}
 for(const item of created.reverse()){const result=await catalog.deleteCatalog(idle,form({entity:item.entity,id:item.id,confirm:'on'}));assert.equal(result.status,'ok',item.entity+' cleanup '+result.message);const check=await db.from(item.table).select('id').eq('id',item.id);assert.ifError(check.error);assert.equal(check.data.length,0);}
}
for(const line of log)console.log('PASS '+line);
console.log('PASS all disposable records/files cleaned up; original mixture restored.');
