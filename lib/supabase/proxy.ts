import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

/** Reachable before sign-in. Everything else is behind the Google login wall. */
export const PUBLIC_PATHS = ["/login", "/auth/callback"] as const;

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const NO_STORE = "private, no-store";

/**
 * First gate only: refreshes the session cookie and turns signed-out visitors
 * away. The superadmin check happens again in every layout, page, and action.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  let signedIn = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    signedIn = !error && typeof data?.claims?.sub === "string";
  } catch {
    signedIn = false;
  }

  const { pathname } = request.nextUrl;
  let target: string | null = null;
  if (pathname === "/") target = signedIn ? "/admin" : "/login";
  else if (signedIn && pathname === "/login") target = "/admin";
  else if (!signedIn && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": NO_STORE } });
    }
    target = "/login";
  }

  if (target) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", NO_STORE);
    return redirect;
  }
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}
