import { createClient } from "@/lib/supabase/server";

function redirectTo(path: "/login" | "/admin") {
  // Fixed relative locations: never built from Host headers or query input.
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return redirectTo("/login");
  try {
    const supabase = await createClient({ writable: true });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Signing in is not authorization: /admin re-checks the superadmin flag
    // and sends non-admins to /denied.
    return redirectTo(error ? "/login" : "/admin");
  } catch {
    return redirectTo("/login");
  }
}
