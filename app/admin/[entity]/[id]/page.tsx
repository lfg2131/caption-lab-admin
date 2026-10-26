import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ENTITIES, entityKey } from "@/lib/entities";
import { isUuid } from "@/lib/captions/validation";
import { catalogOptions } from "@/lib/admin-records";
import { CatalogForm, CatalogDelete } from "../../catalog-form";
const related: Record<string,string>={chain_id:"chains",step_id:"steps",model_id:"models",provider_id:"providers",request_id:"requests",image_id:"images"};
export default async function Detail({params}:{params:Promise<{entity:string;id:string}>}) {
 const {db}=await requireAdmin();const {entity,id}=await params;if(!entityKey(entity)||!isUuid(id))notFound();const config=ENTITIES[entity];
 const columns=config.columns+(entity==="requests"?",prompt_snapshot":entity==="responses"?",output":"");
 const {data:record,error}=await db.from(config.table).select(columns).eq("id",id).maybeSingle();if(error)throw new Error("Could not load record.");if(!record)notFound(); const row = record as unknown as Record<string,unknown>;
 const options=config.writable?await catalogOptions(db):{providers:[],models:[]};
 let attempts:Record<string,unknown>[]=[];let captions:{id:string;caption:string}[]=[];
 if(entity==="requests") {
 const [a,c]=await Promise.all([db.from("caption_lab_responses").select("id,attempt,status,error_code,output,duration_ms,usage,started_at,created_at").eq("request_id",id).order("attempt"),db.from("ai_captions").select("id,caption").eq("generation_request_id",id)]);
 if(a.error||c.error)throw new Error("Could not load execution details."); attempts=a.data??[];captions=c.data??[];
 }
 return <div className="space-y-6"><Link href={`/admin/${entity}`} className="text-brand-soft">← {config.title}</Link><h1 className="text-2xl font-bold break-words">{String(row.name??row.title??row.term??row.domain??row.email??id)}</h1>
 <dl className="card grid gap-4 p-5">{Object.entries(row).map(([key,value])=><div key={key} className="min-w-0"><dt className="text-sm text-muted">{key.replaceAll("_"," ")}</dt><dd className="mt-1 break-words whitespace-pre-wrap">{related[key]&&value?<Link href={`/admin/${related[key]}/${value}`} className="text-brand-soft underline">{String(value)}</Link>:typeof value==="object"?<pre className="max-w-full text-sm break-words whitespace-pre-wrap">{JSON.stringify(value,null,2)}</pre>:String(value??"—")}</dd></div>)}</dl>
 {entity==="chains"&&<Link className="text-brand-soft underline" href="/admin/steps">View ordered chain steps →</Link>}
 {entity==="requests"&&<><h2 className="text-xl font-semibold">Provider attempts ({attempts.length})</h2>{attempts.map(a=><article className="card space-y-3 p-5" key={String(a.id)}><Link className="text-brand-soft underline" href={`/admin/responses/${a.id}`}>Attempt {String(a.attempt)} · {String(a.status)}</Link><pre className="text-sm break-words whitespace-pre-wrap">{JSON.stringify(a,null,2)}</pre></article>)}<h2 className="text-xl font-semibold">Saved captions ({captions.length})</h2><ul>{captions.map(c=><li key={c.id}>{c.caption} <Link className="text-brand-soft underline" href={`/admin/media?q=${encodeURIComponent(c.caption)}`}>View media →</Link></li>)}</ul>{!captions.length&&<p className="text-muted">No saved captions for this request.</p>}</>}
 {config.writable&&<section className="card p-5"><h2 className="mb-4 text-xl font-semibold">Edit record</h2><CatalogForm key={JSON.stringify(row)} entity={entity} row={row} options={options}/><CatalogDelete entity={entity} id={id}/></section>}
 </div>;
}
