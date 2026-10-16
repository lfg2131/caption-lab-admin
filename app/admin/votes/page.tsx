import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadVotes, type VoteFilter } from "@/lib/data";
import { PerspectiveBadge } from "@/app/components/caption-badges";
import { Pagination } from "../pagination";
import { formatDateTime, param, personLabel } from "../format";

export const metadata: Metadata = { title: "Votes" };

const FILTERS: { value: VoteFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "funny", label: "😂 Funny" },
  { value: "not-funny", label: "😐 Not funny" },
];

// READ ONLY: votes cannot be edited or deleted here.
export default async function VotesPage({ searchParams }: PageProps<"/admin/votes">) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const filter = (FILTERS.some((f) => f.value === param(params.vote)) ? param(params.vote) : "all") as VoteFilter;
  const oldestFirst = param(params.sort) === "oldest";
  const { rows, total, page, pages } = await loadVotes(db, { filter, oldestFirst, page: Number(param(params.page)) || 1 });
  const href = (next: Record<string, string>) => {
    const query = new URLSearchParams(Object.entries({ vote: filter === "all" ? "" : filter, sort: oldestFirst ? "oldest" : "", ...next }).filter(([, v]) => v));
    return query.size ? `/admin/votes?${query}` : "/admin/votes";
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Votes</p>
        <h1 className="text-3xl font-bold tracking-tight">Ratings</h1>
        <p className="text-muted">Read-only. Every Funny / Not funny vote, who cast it, and when.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <Link key={option.value} href={href({ vote: option.value === "all" ? "" : option.value })} aria-current={filter === option.value ? "true" : undefined} className={`chip min-h-10 ${filter === option.value ? "border-brand-soft bg-brand/20 text-white" : ""}`}>
            {option.label}
          </Link>
        ))}
        <Link href={href({ sort: oldestFirst ? "" : "oldest" })} className="btn-ghost ml-auto border border-line">
          {oldestFirst ? "Oldest first" : "Newest first"} ⇅
        </Link>
      </div>

      <Pagination page={page} pages={pages} total={total} label={total === 1 ? "vote" : "votes"} params={{ vote: filter === "all" ? "" : filter, sort: oldestFirst ? "oldest" : "" }} basePath="/admin/votes" />

      <div className="card overflow-x-auto">
        <table className="admin-table min-w-[720px]">
          <thead>
            <tr>
              <th scope="col">Vote</th>
              <th scope="col">Caption</th>
              <th scope="col">Voter</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap font-semibold">{row.vote === 1 ? <span className="text-lime-200">😂 Funny</span> : <span className="text-zinc-300">😐 Not funny</span>}</td>
                <td>
                  <p className="text-pretty">“{row.caption ?? "deleted caption"}”</p>
                  <div className="mt-1"><PerspectiveBadge perspective={row.perspective} /></div>
                </td>
                <td>
                  <p>{personLabel(row.voter, row.voterId)}</p>
                  {row.voter?.email && row.voter.name && <p className="text-xs text-muted">{row.voter.email}</p>}
                </td>
                <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="py-10 text-center text-muted">No votes here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
