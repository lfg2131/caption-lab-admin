"use client";

import { useActionState, useState } from "react";
import { deleteCaption, type ActionState } from "./actions";

const IDLE: ActionState = { status: "idle", message: "" };

/** Two-step delete with the consequences spelled out (no blocking browser dialog). */
export function DeleteCaption({ id, votes, imageShared }: { id: string; votes: number; imageShared: boolean }) {
  const [state, action, pending] = useActionState(deleteCaption, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (state.status === "ok") return <p role="status" className="text-sm text-lime-200">{state.message}</p>;
  if (!confirming) {
    return <button type="button" className="btn-ghost border border-red-400/30 text-red-200 hover:bg-red-500/10" onClick={() => setConfirming(true)}>Delete…</button>;
  }
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm" role="alertdialog" aria-label="Confirm delete">
      <input type="hidden" name="id" value={id} />
      <p className="font-semibold text-red-100">Permanently delete this caption?</p>
      <ul className="list-disc space-y-1 pl-5 text-red-100/90">
        <li>Its {votes} vote{votes === 1 ? "" : "s"} will be deleted too.</li>
        <li>{imageShared ? "The photo stays: other captions still use it." : "The photo is used only here, so it will be removed from storage."}</li>
        <li>This can’t be undone.</li>
      </ul>
      <div className="flex gap-2">
        <button type="submit" className="btn min-h-10 bg-red-500 py-2 text-white hover:bg-red-600" disabled={pending}>{pending ? "Deleting…" : "Yes, delete"}</button>
        <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={pending}>Cancel</button>
      </div>
      {state.status === "error" && <p role="alert" className="text-red-200">{state.message}</p>}
    </form>
  );
}
