"use client";
import {useActionState} from "react";
import Link from "next/link";
import {saveMix} from "./actions";
export type MixRow={chain_id:string;enabled:boolean;weight:number;caption_lab_chains:{name:string;application:string;enabled:boolean}};
export function MixForm({rows}:{rows:MixRow[]}) {
 const [state,action,pending]=useActionState(saveMix,{status:"idle" as const,message:""});
 return <form action={action} className="space-y-4" aria-busy={pending}>{rows.map(row=><fieldset key={row.chain_id} className="card flex flex-wrap items-center gap-4 p-5"><legend className="px-2 text-sm">{row.caption_lab_chains.application}</legend><Link href={`/admin/chains/${row.chain_id}`} className="text-brand-soft underline">{row.caption_lab_chains.name}</Link><label className="flex items-center gap-2"><input type="checkbox" name={`enabled:${row.chain_id}`} defaultChecked={row.enabled} disabled={pending||!row.caption_lab_chains.enabled}/>Enabled</label><label className="flex items-center gap-2">Weight <input type="number" name={`weight:${row.chain_id}`} min="1" max="100" step="1" defaultValue={row.weight} required className="field w-24" disabled={pending}/></label></fieldset>)}<button className="btn-brand" disabled={pending}>{pending?"Saving…":"Save mixture"}</button><p role={state.status==="error"?"alert":"status"} className="text-sm">{state.message}</p></form>;
}
