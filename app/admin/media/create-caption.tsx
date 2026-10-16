"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_CONTEXT_LENGTH, MEDIA_BUCKET, PERSPECTIVES, TONES, validateImageFile, type Perspective } from "@/lib/captions/validation";
import { createAiCaption, prepareAdminUpload } from "./actions";

type Status = { kind: "idle" | "working" | "ok" | "error"; message: string };

/** Minimal admin Create: one photo, one Gemini caption (max 10 words), saved as the admin. */
export function CreateCaption() {
  const id = useId();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
  const busy = status.kind === "working";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("photo");
    if (!(file instanceof File) || !file.size) return setStatus({ kind: "error", message: "Choose a photo first." });
    const invalid = validateImageFile(file);
    if (invalid) return setStatus({ kind: "error", message: invalid });

    setStatus({ kind: "working", message: "Uploading photo…" });
    try {
      const prepared = await prepareAdminUpload({ type: file.type, size: file.size, name: file.name });
      if (prepared.status !== "ok" || !prepared.path) throw new Error(prepared.message || "Upload refused.");
      // Uploaded with the admin's own session into their own folder (Storage RLS).
      const { error } = await createClient().storage.from(MEDIA_BUCKET).upload(prepared.path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error("The photo didn’t upload. Try again.");
      setStatus({ kind: "working", message: "Asking Gemini for a caption…" });
      const result = await createAiCaption({
        path: prepared.path,
        context: form.get("context"),
        tone: form.get("tone") || null,
        perspective: form.get("perspective") as Perspective,
      });
      if (result.status !== "ok") throw new Error(result.message);
      setStatus({ kind: "ok", message: result.message });
      formElement.reset();
      router.refresh();
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error && error.message ? error.message : "Something went wrong." });
    }
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end" aria-busy={busy} aria-labelledby={`${id}-title`}>
      <div className="space-y-1 md:col-span-3">
        <h2 id={`${id}-title`} className="font-semibold">Create an AI caption</h2>
        <p className="text-sm text-muted">Upload a photo and Gemini writes one caption (at most 10 words). It’s saved with you as the creator and appears in Caption Lab.</p>
      </div>
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Photo <span className="text-muted">(JPEG, PNG, WebP · 5 MB)</span></span>
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} className="field py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-foreground" />
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Context <span className="text-muted">(optional)</span></span>
        <input name="context" maxLength={MAX_CONTEXT_LENGTH} disabled={busy} placeholder="First time trying dollar pizza at 2am" className="field py-2" />
      </label>
      <div className="flex gap-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Perspective</span>
          <select name="perspective" defaultValue="student" disabled={busy} className="field py-2 capitalize">
            {PERSPECTIVES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Tone</span>
          <select name="tone" defaultValue="" disabled={busy} className="field py-2 capitalize">
            <option value="">Surprise</option>
            {TONES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <button type="submit" className="btn-brand" disabled={busy}>{busy ? "Working…" : "Generate & save caption"}</button>
        <p aria-live="polite" role={status.kind === "error" ? "alert" : "status"} className={`text-sm ${status.kind === "error" ? "text-red-200" : status.kind === "ok" ? "text-lime-200" : "text-muted"}`}>
          {status.message}
        </p>
      </div>
    </form>
  );
}
