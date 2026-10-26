import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/app/components/brand";
import { AdminNav } from "./admin-nav";

// Defense in depth: the layout checks, and so does every page and action.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireAdmin();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
          <Link href="/admin" className="shrink-0 rounded-xl py-1" aria-label="Admin overview">
            <BrandMark compact />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-sm text-muted lg:inline" title={user.email ?? undefined}>{user.email}</span>
            <form action={signOut}>
              <button className="btn-ghost" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[190px_minmax(0,1fr)]"><aside><details className="card p-3 lg:hidden"><summary className="cursor-pointer text-sm font-semibold">Admin navigation</summary><div className="mt-4"><AdminNav /></div></details><div className="hidden lg:block"><AdminNav /></div></aside><main className="min-w-0 pb-12">{children}</main></div>
    </div>
  );
}
