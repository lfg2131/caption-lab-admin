import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/app/components/brand";

export const metadata: Metadata = { title: "Access denied" };

// Signed in, but not a superadmin. Shows nothing from the database.
export default async function DeniedPage() {
  const access = await getAccess();
  if (access.status === "anonymous") redirect("/login");
  if (access.status === "admin") redirect("/admin");

  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center gap-8 px-4 py-12">
      <BrandMark />
      <section className="card space-y-4 p-6" aria-labelledby="denied-title">
        <p aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-red-500/15 text-2xl">🔒</p>
        <h1 id="denied-title" className="text-2xl font-bold">Access denied</h1>
        <p className="text-muted">
          {access.email ? <>You’re signed in as <span className="font-semibold text-foreground">{access.email}</span>, but this</> : "This"} account isn’t a Caption Lab superadmin.
          Admin access is granted only by the project owner in the database.
        </p>
        <form action={signOut}>
          <button type="submit" className="btn-quiet w-full">Sign out</button>
        </form>
      </section>
    </main>
  );
}
