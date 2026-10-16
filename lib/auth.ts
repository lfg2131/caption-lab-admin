import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { createPrivilegedClient, type PrivilegedClient } from "./supabase/privileged";
import { isUuid } from "./captions/validation";

export type AdminUser = { id: string; email: string | null };
export type Access =
  | { status: "anonymous" }
  | { status: "denied"; email: string | null }
  | { status: "admin"; user: AdminUser; db: PrivilegedClient };

/**
 * Two independent server-side checks, both required, failing closed:
 *  1. Authentication: auth.getUser() asks Supabase Auth to validate the session
 *     (signature, expiry, and that the session was not signed out/revoked).
 *  2. Authorization: caption_lab_admins.is_superadmin = true for that user id,
 *     read with the service role. Clients cannot read or write that table.
 * Any error, missing row, or false flag means "not an admin".
 */
export async function getAccess(): Promise<Access> {
  let user: AdminUser;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user || !isUuid(data.user.id)) return { status: "anonymous" };
    user = { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return { status: "anonymous" };
  }

  try {
    const db = createPrivilegedClient();
    const { data, error } = await db
      .from("caption_lab_admins")
      .select("is_superadmin")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || data?.is_superadmin !== true) return { status: "denied", email: user.email };
    return { status: "admin", user, db };
  } catch {
    return { status: "denied", email: user.email };
  }
}

/** For pages and layouts: an admin, or a redirect to /login or /denied. */
export async function requireAdmin() {
  const access = await getAccess();
  if (access.status === "anonymous") redirect("/login");
  if (access.status === "denied") redirect("/denied");
  return access;
}

export class AdminAccessError extends Error {
  constructor(readonly reason: "anonymous" | "denied") {
    super(reason === "anonymous" ? "Sign in again to continue." : "Your account does not have admin access.");
    this.name = "AdminAccessError";
  }
}

/** For Server Actions and Route Handlers: an admin, or a thrown AdminAccessError (no work done). */
export async function assertAdmin() {
  const access = await getAccess();
  if (access.status !== "admin") throw new AdminAccessError(access.status);
  return access;
}
