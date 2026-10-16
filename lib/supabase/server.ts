import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/** The visitor's own session (anon key + auth cookies). Used to verify who they are. */
export async function createClient({ writable = false } = {}) {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch (error) {
          // Server Components cannot write cookies; the proxy refreshes them.
          if (writable) throw error;
        }
      },
    },
  });
}
