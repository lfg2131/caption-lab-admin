import type { Metadata } from "next";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { loadMedia } from "@/lib/data";
import { PerspectiveBadge, ToneBadge } from "@/app/components/caption-badges";
import { Pagination } from "../pagination";
import { formatDateTime, param, personLabel } from "../format";
import { CreateCaption } from "./create-caption";
import { CaptionEditor } from "./caption-editor";
import { DeleteCaption } from "./delete-caption";

export const metadata: Metadata = { title: "Media" };
// Server Actions on this page include Gemini generation (up to two 25s attempts).
export const maxDuration = 60;

export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const query = param(params.q).slice(0, 100);
  const { rows, total, page, pages } = await loadMedia(db, { query, page: Number(param(params.page)) || 1 });
  const deleted = deletedNotice(params);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Media</p>
          <h1 className="text-3xl font-bold tracking-tight">AI-generated captions</h1>
          <p className="text-muted">Create, review, edit, and delete captions. Edits keep the 10-word limit.</p>
        </div>
        <form className="flex w-full gap-2 sm:w-auto" role="search">
          <label htmlFor="q" className="sr-only">Search captions</label>
          <input id="q" name="q" defaultValue={query} placeholder="Search caption text" className="field min-h-11 py-2 sm:w-64" />
          <button className="btn-quiet min-h-11 py-2" type="submit">Search</button>
        </form>
      </header>

      {deleted && <p role="status" className="alert-success">{deleted}</p>}

      <CreateCaption />

      <Pagination page={page} pages={pages} total={total} label={total === 1 ? "caption" : "captions"} params={{ q: query }} basePath="/admin/media" />

      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.id} id={`caption-${row.id}`} className="card grid gap-5 p-4 sm:grid-cols-[160px_1fr] sm:p-5">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-900 sm:w-40">
              {row.imageUrl ? (
                <Image src={row.imageUrl} alt={row.image_alt || "Caption photo."} fill unoptimized sizes="160px" className="object-cover" />
              ) : <p className="absolute inset-0 grid place-items-center text-xs text-muted">Photo unavailable</p>}
              {row.imageShared && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">Shared photo</span>}
            </div>
            <div className="min-w-0 space-y-3">
              <p className="text-lg leading-snug font-semibold text-pretty">“{row.caption}”</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <PerspectiveBadge perspective={row.perspective} />
                <ToneBadge tone={row.tone} />
                <span className="rounded-full border border-line px-2.5 py-1">😂 {row.funny} · 😐 {row.notFunny}</span>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2"><dt className="text-muted">Creator</dt><dd className="truncate">{personLabel(row.creator, row.creator_id)}{row.creator?.email && row.creator.name ? ` (${row.creator.email})` : ""}</dd></div>
                <div className="flex gap-2"><dt className="text-muted">Created</dt><dd>{formatDateTime(row.created_at)}</dd></div>
                <div className="flex gap-2"><dt className="text-muted">Model</dt><dd className="font-mono text-xs leading-5">{row.model}</dd></div>
                <div className="flex gap-2"><dt className="text-muted">Context</dt><dd className="truncate">{row.user_context ?? "—"}</dd></div>
              </dl>
              <details className="rounded-2xl border border-line bg-background/40 text-sm">
                <summary className="cursor-pointer px-4 py-2.5 font-medium">Generation prompt</summary>
                <pre className="max-h-64 overflow-auto px-4 pb-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">{row.generation_prompt}</pre>
              </details>
              <details className="rounded-2xl border border-line text-sm">
                <summary className="cursor-pointer px-4 py-2.5 font-medium">Edit</summary>
                <div className="px-4 pb-4">
                  {/* Keyed on the saved values: after any save the editor restarts from the database row. */}
                  <CaptionEditor key={`${row.caption}|${row.perspective}|${row.tone}`} id={row.id} caption={row.caption} perspective={row.perspective} tone={row.tone} />
                </div>
              </details>
              <DeleteCaption id={row.id} votes={row.funny + row.notFunny} imageShared={row.imageShared} />
            </div>
          </li>
        ))}
        {!rows.length && <li className="card p-10 text-center text-muted">{query ? `No captions match “${query}”.` : "No captions yet."}</li>}
      </ul>
    </div>
  );
}

/** Fixed wording only; the query values are validated, never echoed. */
function deletedNotice(params: Record<string, string | string[] | undefined>) {
  if (param(params.deleted) !== "1") return null;
  const votes = Number.parseInt(param(params.votes), 10);
  const count = Number.isSafeInteger(votes) && votes >= 0 && votes < 1_000_000 ? votes : 0;
  const photo = param(params.photo);
  const image = photo === "removed" ? "Its photo was no longer used and was removed from storage." : photo === "kept" ? "The photo was kept because other captions still use it." : "";
  return `Caption deleted, along with its ${count} vote${count === 1 ? "" : "s"}. ${image}`.trim();
}
