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
          <div className="order-3 w-full sm:order-none sm:mx-auto sm:w-auto">
            <AdminNav />
          </div>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <span className="hidden max-w-48 truncate text-sm text-muted lg:inline" title={user.email ?? undefined}>{user.email}</span>
            <form action={signOut}>
              <button className="btn-ghost" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-10">{children}</main>
    </div>
  );
}
