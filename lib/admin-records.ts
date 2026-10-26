import "server-only";
import type { PrivilegedClient } from "./supabase/privileged";

/** Exhaustive paged fetch for small configuration catalogs and aggregate inputs. */
export async function allRows(db: PrivilegedClient, table: "caption_lab_models" | "caption_lab_providers" | "ai_captions" | "caption_votes", columns: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select(columns).order("id").range(offset,offset+999);
    if (error) throw new Error("Records could not be loaded.");
    rows.push(...((data ?? []) as unknown as Record<string,unknown>[]));
    if (!data || data.length < 1000) return rows;
  }
}
export async function catalogOptions(db: PrivilegedClient) {
 const [providers,models]=await Promise.all([allRows(db,"caption_lab_providers","id,name"),allRows(db,"caption_lab_models","id,name")]);
 return {providers:providers as {id:string;name:string}[],models:models as {id:string;name:string}[]};
}
