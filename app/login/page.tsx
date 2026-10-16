import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/app/components/brand";
import GoogleSignIn from "./google-sign-in";

export const metadata: Metadata = { title: "Sign in" };

// Public: shows no administrative data. Signed-in visitors go on to /admin,
// which decides between the dashboard and Access denied.
export default async function LoginPage() {
  const { data } = await (await createClient()).auth.getClaims().catch(() => ({ data: null }));
  if (data?.claims?.sub) redirect("/admin");

  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center gap-8 px-4 py-12">
      <BrandMark />
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Admin sign-in</h1>
        <p className="text-muted">
          Restricted to Caption Lab superadmins. Sign in with Google; access is then checked against the admin list in the database.
        </p>
      </div>
      <div className="card space-y-4 p-6">
        <GoogleSignIn />
        <p className="text-sm text-muted">Not an admin? Use the main app instead. Signing in here grants nothing by itself.</p>
      </div>
    </main>
  );
}
