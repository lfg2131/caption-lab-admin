"use client";

import { useActionState, useState } from "react";
import { MAX_CAPTION_WORDS, PERSPECTIVES, TONES, countWords } from "@/lib/captions/validation";
import { updateCaption, type ActionState } from "./actions";

const IDLE: ActionState = { status: "idle", message: "" };

/** Edit caption text, perspective, and tone. The server re-validates everything. */
export function CaptionEditor({ id, caption, perspective, tone }: { id: string; caption: string; perspective: string; tone: string | null }) {
  const [state, action, pending] = useActionState(updateCaption, IDLE);
  const [text, setText] = useState(caption);
  const words = countWords(text);
  const tooLong = words > MAX_CAPTION_WORDS;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1.5 text-sm">
        <span className="flex justify-between font-medium">
          Caption
          <span className={tooLong ? "text-red-200" : "text-muted"} aria-live="polite">{words}/{MAX_CAPTION_WORDS} words</span>
        </span>
        <textarea name="caption" value={text} onChange={(event) => setText(event.target.value)} rows={2} maxLength={200} required className="field resize-y py-2" aria-invalid={tooLong} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Perspective</span>
          <select name="perspective" defaultValue={perspective} className="field py-2 capitalize">
            {PERSPECTIVES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Tone</span>
          <select name="tone" defaultValue={tone ?? ""} className="field py-2 capitalize">
            <option value="">None</option>
            {TONES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="submit" className="btn-quiet min-h-11 py-2" disabled={pending || tooLong}>{pending ? "Saving…" : "Save changes"}</button>
      </div>
      <p aria-live="polite" className={`text-sm ${state.status === "error" ? "text-red-200" : "text-lime-200"}`}>{state.message}</p>
    </form>
  );
}
