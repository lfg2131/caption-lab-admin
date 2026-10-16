import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for administrative reads and writes. Server-only: the
 * key is a non-public env var and this module fails the build if imported
 * from client code. Never call this before requireAdmin()/assertAdmin() has
 * verified the Google session AND caption_lab_admins.is_superadmin.
 */
export function createPrivilegedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Admin database access is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type PrivilegedClient = ReturnType<typeof createPrivilegedClient>;
