"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminAccessError, assertAdmin } from "@/lib/auth";
import {
  CAPTION_COUNT,
  MAX_IMAGE_BYTES,
  MEDIA_BUCKET,
  buildImagePath,
  extensionMimeType,
  isImageMimeType,
  isOwnedImagePath,
  isPerspective,
  isTone,
  isUuid,
  parseGenerationOptions,
  sniffImageType,
  validateCaptionText,
  validateImageFile,
} from "@/lib/captions/validation";
import { buildCaptionPrompt } from "@/lib/captions/prompt";
import { GenerationError, generateCaptions, getGeminiConfig } from "@/lib/captions/gemini";

// Every action starts with assertAdmin(): a verified Google session AND
// caption_lab_admins.is_superadmin. Only then is the service-role client used.
// Nothing here trusts a user id, creator, or image owner sent by the browser.

export type ActionState = { status: "idle" | "ok" | "error"; message: string; id?: string };

function denied(error: unknown): ActionState {
  if (error instanceof AdminAccessError) return { status: "error", message: error.message };
  throw error;
}

function refresh() {
  revalidatePath("/admin", "layout");
}

/** Step 1 of Create: validate photo metadata; the path is inside the admin's own folder. */
export async function prepareAdminUpload(file: unknown): Promise<ActionState & { path?: string }> {
  let admin;
  try { admin = await assertAdmin(); } catch (error) { return denied(error); }
  const meta = file as { type?: unknown; size?: unknown; name?: unknown } | null;
  if (!meta || typeof meta.type !== "string" || typeof meta.size !== "number" || typeof meta.name !== "string") {
    return { status: "error", message: "Choose a photo first." };
  }
  const invalid = validateImageFile({ type: meta.type, size: meta.size, name: meta.name });
  if (invalid || !isImageMimeType(meta.type)) return { status: "error", message: invalid ?? "Choose a photo first." };
  return { status: "ok", message: "", path: buildImagePath(admin.user.id, crypto.randomUUID(), meta.type) };
}

/** Step 2 of Create: verify the uploaded bytes, ask Gemini for one caption, save it. */
export async function createAiCaption(input: unknown): Promise<ActionState> {
  let admin;
  try { admin = await assertAdmin(); } catch (error) { return denied(error); }
  const { db, user } = admin;
  const { path, context, tone, perspective } = (input ?? {}) as Record<string, unknown>;
  // Only the admin's own fresh upload (the DB also requires folder = creator).
  if (!isOwnedImagePath(path, user.id)) return { status: "error", message: "That upload couldn’t be found. Add the photo again." };
  const cleanup = () => db.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);

  const options = parseGenerationOptions(context, tone, perspective);
  if ("error" in options) {
    await cleanup();
    return { status: "error", message: options.error };
  }
  const { data: blob, error: downloadError } = await db.storage.from(MEDIA_BUCKET).download(path);
  if (downloadError || !blob) return { status: "error", message: "That upload couldn’t be found. Add the photo again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES || !sniffed || sniffed !== extensionMimeType(path)) {
    await cleanup();
    return { status: "error", message: "That file isn’t a supported photo under 5 MB (JPEG, PNG, or WebP)." };
  }

  const prompt = buildCaptionPrompt(options, { path, mimeType: sniffed, bytes: bytes.byteLength });
  let generated: Awaited<ReturnType<typeof generateCaptions>>;
  try {
    // Same validation as the main app: at most 10 words, bounded retry.
    generated = await generateCaptions({ prompt, image: bytes, mimeType: sniffed }, getGeminiConfig());
  } catch (error) {
    await cleanup();
    return { status: "error", message: error instanceof GenerationError ? error.userMessage : "Caption generation failed. Try again." };
  }

  const { data: rows, error: insertError } = await db
    .from("ai_captions")
    .insert(generated.captions.map((caption) => ({
      batch_id: crypto.randomUUID(),
      creator_id: user.id,
      source_image_path: path,
      caption,
      generation_prompt: prompt.persisted,
      user_context: options.context,
      tone: options.tone,
      perspective: options.perspective,
      model: generated.model,
      image_alt: generated.altText,
    })))
    .select("id, caption");
  if (insertError || rows?.length !== CAPTION_COUNT) {
    await cleanup();
    return { status: "error", message: "The caption was written but couldn’t be saved. Nothing was created." };
  }
  refresh();
  return { status: "ok", message: `Created: “${rows[0].caption}”`, id: rows[0].id };
}

/** Edit a caption's text, perspective, and tone (validated, ten-word limit). */
export async function updateCaption(_prev: ActionState, form: FormData): Promise<ActionState> {
  let admin;
  try { admin = await assertAdmin(); } catch (error) { return denied(error); }
  const id = form.get("id");
  if (!isUuid(id)) return { status: "error", message: "Unknown caption." };
  const text = validateCaptionText(form.get("caption"));
  if ("error" in text) return { status: "error", message: text.error, id };
  const perspective = form.get("perspective");
  if (!isPerspective(perspective)) return { status: "error", message: "Pick Student or Professor.", id };
  const toneValue = form.get("tone") || null;
  if (toneValue !== null && !isTone(toneValue)) return { status: "error", message: "Pick a valid tone.", id };

  const { data, error } = await admin.db
    .from("ai_captions")
    .update({ caption: text.caption, perspective, tone: toneValue })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error?.code === "23514") return { status: "error", message: "The database rejected that caption (at most 10 words).", id };
  if (error) return { status: "error", message: "The update didn’t save. Try again.", id };
  if (!data) return { status: "error", message: "That caption no longer exists.", id };
  refresh();
  return { status: "ok", message: "Saved.", id };
}

/**
 * Delete one caption. Its votes go with it (existing ON DELETE CASCADE). The
 * image is removed from Storage only when no other caption still uses it.
 */
export async function deleteCaption(_prev: ActionState, form: FormData): Promise<ActionState> {
  let admin;
  try { admin = await assertAdmin(); } catch (error) { return denied(error); }
  const { db } = admin;
  const id = form.get("id");
  if (!isUuid(id)) return { status: "error", message: "Unknown caption." };

  const { data: row, error: readError } = await db.from("ai_captions").select("id, source_image_path").eq("id", id).maybeSingle();
  if (readError) return { status: "error", message: "Couldn’t load that caption. Try again.", id };
  if (!row) return { status: "error", message: "That caption was already deleted.", id };
  const { count: votes } = await db.from("caption_votes").select("id", { count: "exact", head: true }).eq("caption_id", id);

  const { data: deleted, error } = await db.from("ai_captions").delete().eq("id", id).select("id");
  if (error || !deleted?.length) return { status: "error", message: "The delete didn’t go through. Try again.", id };

  const { count: remaining, error: usageError } = await db
    .from("ai_captions")
    .select("id", { count: "exact", head: true })
    .eq("source_image_path", row.source_image_path);
  let photo = "kept";
  if (!usageError && remaining === 0) {
    const { error: removeError } = await db.storage.from(MEDIA_BUCKET).remove([row.source_image_path]);
    photo = removeError ? "unknown" : "removed";
  }
  refresh();
  // The deleted row's card unmounts, so the outcome is shown at page level.
  redirect(`/admin/media?deleted=1&votes=${votes ?? 0}&photo=${photo}`);
}
