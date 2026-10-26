import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ENTITIES, entityKey } from "@/lib/entities";
import { catalogOptions } from "@/lib/admin-records";
import { CatalogForm } from "../catalog-form";
import { Pagination } from "../pagination";

export default async function CatalogPage({ params, searchParams }: { params: Promise<{entity:string}>; searchParams: Promise<{page?:string}> }) {
 const {db}=await requireAdmin(); const {entity}=await params;
 if(!entityKey(entity)) notFound();
 const config=ENTITIES[entity]; const query=await searchParams; const page=Math.max(1,Math.min(100000,Number(query.page)||1));
 const {data,error,count}=await db.from(config.table).select(config.columns,{count:"exact"}).order("id").range((page-1)*25,page*25-1);
 if(error) throw new Error("Could not load records.");
 const rows=(data??[]) as unknown as Record<string,unknown>[];
 const options=config.writable?await catalogOptions(db):{providers:[],models:[]};
 return <div className="space-y-6"><header><p className="eyebrow">Catalog & observability</p><h1 className="mt-2 text-3xl font-bold">{config.title}</h1><p className="mt-3 text-muted">{config.description}</p></header>
 {config.writable&&<details className="card p-5"><summary className="cursor-pointer font-semibold">Create record</summary><div className="mt-4"><CatalogForm entity={entity} options={options}/></div></details>}
 <p className="text-sm text-muted">{count??0} records · page {page}</p>
 <ul className="grid gap-3">{rows.map(row=><li key={String(row.id)} className="card min-w-0 p-4"><Link className="font-semibold text-brand-soft underline" href={`/admin/${entity}/${row.id}`}>{String(row.name??row.title??row.term??row.domain??row.email??row.id)}</Link><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(row).filter(([key])=>!["id","system_template","user_template"].includes(key)).map(([key,value])=><div key={key} className="min-w-0"><dt className="text-xs text-muted">{key.replaceAll("_"," ")}</dt><dd className="break-words whitespace-pre-wrap">{typeof value==="object"?JSON.stringify(value):String(value??"—")}</dd></div>)}</dl></li>)}</ul>
 {!rows.length&&<p className="card p-5 text-muted">No records yet.</p>}
 <Pagination page={page} pages={Math.max(1,Math.ceil((count??0)/25))} total={count??0} basePath={`/admin/${entity}`} label="records" params={{}}/>
 </div>;
}
