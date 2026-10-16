import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadStats } from "@/lib/data";
import { PerspectiveBadge } from "@/app/components/caption-badges";
import { DailyBarChart } from "./bar-chart";
import { formatDateTime, personLabel } from "./format";

export const metadata: Metadata = { title: "Overview" };

const FUNNY = "#76a020";
const NOT_FUNNY = "#52525b";

export default async function OverviewPage() {
  const { db } = await requireAdmin();
  const stats = await loadStats(db);
  const rated = stats.funny + stats.notFunny;
  const funnyShare = rated ? Math.round((stats.funny / rated) * 100) : 0;
  const perCaption = stats.captions ? (stats.votes / stats.captions).toFixed(1) : "0";

  const tiles = [
    { label: "Registered users", value: stats.users, note: `${stats.profiles} with a profile`, href: "/admin/users" },
    { label: "AI captions", value: stats.captions, note: `${stats.student} student · ${stats.professor} professor`, href: "/admin/media" },
    { label: "Image posts", value: stats.images, note: "distinct uploaded photos", href: "/admin/media" },
    { label: "Votes", value: stats.votes, note: `${perCaption} per caption`, href: "/admin/votes" },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Overview</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Caption Lab at a glance</h1>
        <p className="text-muted">Live numbers from the production database.</p>
      </header>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link href={tile.href} className="card block h-full p-5 transition hover:border-zinc-500">
              <p className="text-sm text-muted">{tile.label}</p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-tight tabular-nums">{tile.value}</p>
              <p className="mt-1 text-xs text-muted">{tile.note}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="card space-y-4 p-5" aria-labelledby="split-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="split-title" className="font-semibold">Funny vs Not funny</h2>
          <p className="text-sm text-muted">{rated} votes</p>
        </div>
        {rated ? (
          <>
            <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${stats.funny} Funny (${funnyShare}%), ${stats.notFunny} Not funny (${100 - funnyShare}%)`}>
              {stats.funny > 0 && <div style={{ width: `${funnyShare}%`, background: FUNNY }} />}
              {stats.notFunny > 0 && <div style={{ width: `${100 - funnyShare}%`, background: NOT_FUNNY }} />}
            </div>
            <dl className="flex flex-wrap justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: FUNNY }} />
                <dt>😂 Funny</dt>
                <dd className="font-semibold tabular-nums">{stats.funny} · {funnyShare}%</dd>
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: NOT_FUNNY }} />
                <dt>😐 Not funny</dt>
                <dd className="font-semibold tabular-nums">{stats.notFunny} · {100 - funnyShare}%</dd>
              </div>
            </dl>
          </>
        ) : <p className="text-sm text-muted">No votes yet.</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <DailyBarChart title="Captions generated per day" unit="captions" points={stats.activity.map((day) => ({ day: day.day, value: day.captions }))} />
        <DailyBarChart title="Votes cast per day" unit="votes" points={stats.activity.map((day) => ({ day: day.day, value: day.votes }))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="recent-captions">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="recent-captions" className="font-semibold">Latest captions</h2>
            <Link href="/admin/media" className="text-sm font-semibold text-brand-soft hover:text-white">All media →</Link>
          </div>
          <ul className="divide-y divide-line">
            {stats.latestCaptions.map((row) => (
              <li key={row.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <p className="font-medium text-pretty">“{row.caption}”</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <PerspectiveBadge perspective={row.perspective} />
                  {personLabel(row.creator, row.creator_id)} · {formatDateTime(row.created_at)}
                </p>
              </li>
            ))}
            {!stats.latestCaptions.length && <li className="text-sm text-muted">No captions yet.</li>}
          </ul>
        </section>
        <section className="card p-5" aria-labelledby="recent-votes">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="recent-votes" className="font-semibold">Latest votes</h2>
            <Link href="/admin/votes" className="text-sm font-semibold text-brand-soft hover:text-white">All votes →</Link>
          </div>
          <ul className="divide-y divide-line">
            {stats.latestVotes.map((row) => (
              <li key={row.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm"><span className="font-semibold">{row.vote === 1 ? "😂 Funny" : "😐 Not funny"}</span> <span className="text-muted">on</span> “{row.caption ?? "deleted caption"}”</p>
                <p className="text-xs text-muted">{personLabel(row.voter)} · {formatDateTime(row.createdAt)}</p>
              </li>
            ))}
            {!stats.latestVotes.length && <li className="text-sm text-muted">No votes yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
