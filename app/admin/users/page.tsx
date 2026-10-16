import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { loadUsers } from "@/lib/data";
import { Pagination } from "../pagination";
import { formatDateTime, param } from "../format";

export const metadata: Metadata = { title: "Users" };

// READ ONLY: no edit, delete, or role controls exist for users.
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const query = param(params.q).slice(0, 100);
  const { rows, total, page, pages } = await loadUsers(db, { query, page: Number(param(params.page)) || 1 });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Users</p>
          <h1 className="text-3xl font-bold tracking-tight">Registered users & profiles</h1>
          <p className="text-muted">Read-only. Accounts, profile names, and Caption Lab activity.</p>
        </div>
        <form className="flex w-full gap-2 sm:w-auto" role="search">
          <label htmlFor="q" className="sr-only">Search users</label>
          <input id="q" name="q" defaultValue={query} placeholder="Search name or email" className="field min-h-11 py-2 sm:w-64" />
          <button className="btn-quiet min-h-11 py-2" type="submit">Search</button>
        </form>
      </header>

      <Pagination page={page} pages={pages} total={total} label={total === 1 ? "user" : "users"} params={{ q: query }} basePath="/admin/users" />

      <div className="card overflow-x-auto">
        <table className="admin-table min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Profile</th>
              <th scope="col">Sign-in</th>
              <th scope="col">Joined</th>
              <th scope="col">Last sign-in</th>
              <th scope="col" className="text-right">Captions</th>
              <th scope="col" className="text-right">Votes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const profileName = [row.profile?.firstName, row.profile?.lastName].filter(Boolean).join(" ") || row.profile?.name;
              return (
                <tr key={row.id}>
                  <td>
                    <p className="font-semibold">{row.name || profileName || "—"}</p>
                    <p className="text-xs text-muted">{row.email ?? "no email"}</p>
                  </td>
                  <td>
                    {row.profile ? (
                      <>
                        <p>{profileName || "—"}</p>
                        <p className="text-xs text-muted">{row.profile.username ? `@${row.profile.username}` : "no username"}</p>
                      </>
                    ) : <span className="text-muted">No profile</span>}
                  </td>
                  <td className="capitalize">{row.provider ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                  <td className="whitespace-nowrap">{formatDateTime(row.lastSignInAt)}</td>
                  <td className="text-right tabular-nums">{row.captions}</td>
                  <td className="text-right tabular-nums">{row.votes}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="py-10 text-center text-muted">No users match “{query}”.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
