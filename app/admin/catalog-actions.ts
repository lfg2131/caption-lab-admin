"use server";
import { revalidatePath } from "next/cache";
import { assertAdmin, AdminAccessError } from "@/lib/auth";
import { ENTITIES, entityKey } from "@/lib/entities";
import { validateEntity } from "@/lib/entity-validation";
import { isUuid } from "@/lib/captions/validation";
export type CatalogState = { status: "idle" | "ok" | "error"; message: string };
function failure(error: unknown): CatalogState { return { status: "error", message: error instanceof AdminAccessError ? error.message : "The operation could not be completed. Refresh and try again." }; }
function databaseError(code?: string): CatalogState { return { status: "error", message: code === "23505" ? "That value already exists. Choose a unique value." : code === "23503" ? "This record is in use, or a referenced record no longer exists. Remove dependencies before deleting." : "The database rejected this change. Refresh and check the values." }; }

export async function saveCatalog(_state: CatalogState, form: FormData): Promise<CatalogState> {
  let admin; try { admin = await assertAdmin(); } catch (error) { return failure(error); }
  const key = form.get("entity"); const id = form.get("id");
  if (!entityKey(key) || !ENTITIES[key].writable || (id && !isUuid(id))) return { status: "error", message: "Unsupported record or operation." };
  const parsed = validateEntity(key, form);
  if ("error" in parsed) return { status: "error", message: parsed.error! };
  const { values } = parsed;
  const { db } = admin;
  // Verify relationship choices explicitly, as well as relying on database FKs.
  for (const [field, table] of [["provider_id","caption_lab_providers"],["model_id","caption_lab_models"]] as const) {
    if (!values[field]) continue;
    const { data, error } = await db.from(table).select("id").eq("id", values[field]).maybeSingle();
    if (error || !data) return { status: "error", message: "The selected provider/model is unavailable." };
  }
  if (id && (key === "models" || key === "providers")) {
    const { data: found, error } = await db.from(ENTITIES[key].table).select(key === "models" ? "id,model_key,provider_id" : "id,slug").eq("id", id).maybeSingle();
    const existing = found as unknown as Record<string,unknown> | null;
    if (error || !existing) return { status: "error", message: "Record not found." };
    let used = false;
    if (key === "models") {
      const result = await db.from("caption_lab_steps").select("id", { count: "exact", head: true }).eq("model_id", id);
      if (result.error) return failure(result.error);
      used = (result.count ?? 0) > 0;
    } else {
      const result = await db.from("caption_lab_models").select("id", { count: "exact", head: true }).eq("provider_id", id);
      if (result.error) return failure(result.error);
      used = (result.count ?? 0) > 0;
    }
    if (used && (values.active === false || (key === "models" ? values.model_key !== existing.model_key || values.provider_id !== existing.provider_id : values.slug !== existing.slug))) return { status: "error", message: "This configuration is in use. Its identity and active state must be preserved; you can edit its display name." };
  }
  const query = id ? db.from(ENTITIES[key].table).update(values).eq("id", id) : db.from(ENTITIES[key].table).insert(values);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return databaseError(error.code);
  if (!data) return { status: "error", message: "That record no longer exists." };
  revalidatePath("/admin", "layout");
  return { status: "ok", message: "Saved. Values are persisted in Supabase." };
}

export async function deleteCatalog(_state: CatalogState, form: FormData): Promise<CatalogState> {
  let admin; try { admin = await assertAdmin(); } catch (error) { return failure(error); }
  const key = form.get("entity"); const id = form.get("id");
  if (!entityKey(key) || !ENTITIES[key].writable || !isUuid(id) || form.get("confirm") !== "on") return { status: "error", message: "Confirm deletion of a supported record." };
  const { data, error } = await admin.db.from(ENTITIES[key].table).delete().eq("id", id).select("id").maybeSingle();
  if (error) return databaseError(error.code);
  if (!data) return { status: "error", message: "That record no longer exists." };
  revalidatePath("/admin", "layout");
  return { status: "ok", message: "Deleted." };
}
