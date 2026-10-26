"use client";
import { useActionState } from "react";
import { ENTITIES, type EntityKey, type Field } from "@/lib/entities";
import { saveCatalog, deleteCatalog } from "./catalog-actions";
export type Options = { providers: {id:string;name:string}[]; models: {id:string;name:string}[] };
export function CatalogForm({ entity, row, options }: { entity: EntityKey; row?: Record<string, unknown>; options: Options }) {
  const [state, action, pending] = useActionState(saveCatalog, { status: "idle" as const, message: "" });
  return <form action={action} className="grid gap-4" aria-busy={pending}>
    <input type="hidden" name="entity" value={entity} /><input type="hidden" name="id" value={String(row?.id ?? "")} />
    {(ENTITIES[entity].fields as readonly Field[]).map((field) => <label key={field.key} className="grid gap-1 text-sm">
      <span>{field.label}</span>
      {field.kind === "boolean" ? <input type="checkbox" name={field.key} defaultChecked={row ? row[field.key] === true : true} disabled={pending} className="size-5" /> : field.kind === "textarea" ? <textarea name={field.key} defaultValue={String(row?.[field.key] ?? "")} maxLength={field.max} required={!field.optional} rows={4} className="field" disabled={pending} /> : field.kind === "provider" || field.kind === "model" ? <select name={field.key} defaultValue={String(row?.[field.key] ?? "")} required={!field.optional} className="field" disabled={pending}><option value="">Choose…</option>{(field.kind === "provider" ? options.providers : options.models).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <input name={field.key} defaultValue={String(row?.[field.key] ?? "")} maxLength={field.max} required={!field.optional} className="field" disabled={pending} />}
    </label>)}
    <button className="btn-brand justify-self-start" disabled={pending}>{pending ? "Saving…" : row ? "Save changes" : "Create record"}</button>
    <p role={state.status === "error" ? "alert" : "status"} className="text-sm">{state.message}</p>
  </form>;
}
export function CatalogDelete({entity,id}: {entity:EntityKey;id:string}) {
 const [state,action,pending]=useActionState(deleteCatalog,{status:"idle" as const,message:""});
 return <form action={action} className="mt-6 space-y-3 border-t border-line pt-4"><input type="hidden" name="entity" value={entity}/><input type="hidden" name="id" value={id}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" required disabled={pending}/> Permanently delete this record</label><button className="btn-quiet" disabled={pending}>{pending ? "Deleting…" : "Delete record"}</button><p role={state.status==="error"?"alert":"status"} className="text-sm">{state.message}</p></form>;
}
