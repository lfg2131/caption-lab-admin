import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-ts.mjs";
import { ADMIN, USER, adminLookup, plain, privilegedClient, sessionClient } from "./helpers/fakes.mjs";

// The authorization core: Google session (getUser) AND caption_lab_admins.is_superadmin.

function loadAuth({ session, db, privilegedThrows = false }) {
  return loadModule("lib/auth.ts", {
    "server-only": {},
    "./supabase/server": { createClient: async () => session.client },
    "./supabase/privileged": { createPrivilegedClient: () => { if (privilegedThrows) throw new Error("not configured"); return db.client; } },
    "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
  });
}

const signedIn = (id = ADMIN) => sessionClient({ user: { id, email: id === ADMIN ? "owner@example.com" : "student@example.com" } });

test("verified superadmin gets access, looked up by the verified user id", async () => {
  const db = privilegedClient(adminLookup(true));
  const access = await loadAuth({ session: signedIn(), db }).getAccess();
  assert.equal(access.status, "admin");
  assert.equal(access.user.id, ADMIN);
  assert.deepEqual(plain(db.calls.filter((c) => c[0] === "caption_lab_admins")), [
    ["caption_lab_admins", "from"],
    ["caption_lab_admins", "select", "is_superadmin"],
    ["caption_lab_admins", "eq", "user_id", ADMIN],
  ]);
});

for (const [label, flag] of [["no membership row", null], ["is_superadmin = false", false], ["membership lookup error", "error"]]) {
  test(`signed-in non-admin is denied: ${label}`, async () => {
    const access = await loadAuth({ session: signedIn(USER), db: privilegedClient(adminLookup(flag)) }).getAccess();
    assert.equal(access.status, "denied");
    assert.equal(access.db, undefined, "no privileged client handed out");
  });
}

test("a truthy but non-boolean flag is not enough (strict true only)", async () => {
  const access = await loadAuth({ session: signedIn(USER), db: privilegedClient(() => ({ data: { is_superadmin: "true" }, error: null })) }).getAccess();
  assert.equal(access.status, "denied");
});

test("missing service-role configuration fails closed", async () => {
  const access = await loadAuth({ session: signedIn(), db: privilegedClient(adminLookup(true)), privilegedThrows: true }).getAccess();
  assert.equal(access.status, "denied");
});

for (const [label, session] of [
  ["no session", sessionClient()],
  ["invalid or signed-out session", sessionClient({ error: { message: "session_not_found" } })],
  ["auth server unreachable", sessionClient({ throws: true })],
  ["malformed user id", sessionClient({ user: { id: "not-a-uuid" } })],
]) {
  test(`anonymous: ${label}; the admin table is never queried`, async () => {
    const db = privilegedClient(adminLookup(true));
    const access = await loadAuth({ session, db }).getAccess();
    assert.equal(access.status, "anonymous");
    assert.equal(db.calls.length, 0);
  });
}

test("requireAdmin redirects anonymous -> /login and non-admins -> /denied", async () => {
  await assert.rejects(loadAuth({ session: sessionClient(), db: privilegedClient() }).requireAdmin(), /REDIRECT:\/login/);
  await assert.rejects(loadAuth({ session: signedIn(USER), db: privilegedClient(adminLookup(false)) }).requireAdmin(), /REDIRECT:\/denied/);
  const access = await loadAuth({ session: signedIn(), db: privilegedClient(adminLookup(true)) }).requireAdmin();
  assert.equal(access.status, "admin");
});

test("assertAdmin throws AdminAccessError for anonymous and non-admin callers", async () => {
  const anon = loadAuth({ session: sessionClient(), db: privilegedClient() });
  await assert.rejects(anon.assertAdmin(), (e) => e.name === "AdminAccessError" && e.reason === "anonymous");
  const user = loadAuth({ session: signedIn(USER), db: privilegedClient(adminLookup(null)) });
  await assert.rejects(user.assertAdmin(), (e) => e.name === "AdminAccessError" && e.reason === "denied");
});

test("proxy: only /login and /auth/callback are public; API calls get 401", async () => {
  class FakeResponse {
    constructor(status = 200, location = null) {
      this.status = status;
      this.headers = new Headers(location ? { location } : {});
      const jar = [];
      this.cookies = { set: (c) => jar.push(c), getAll: () => jar };
    }
    static next() { return new FakeResponse(); }
    static redirect(url) { return new FakeResponse(307, url.toString()); }
    static json(body, init = {}) { return new FakeResponse(init.status ?? 200); }
  }
  const run = async (path, userId) => {
    const { updateSession } = loadModule("lib/supabase/proxy.ts", {
      "@supabase/ssr": { createServerClient: () => sessionClient({ user: userId ? { id: userId } : null }).client },
      "next/server": { NextResponse: FakeResponse },
    }, { env: { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" } });
    const url = `https://admin.example${path}`;
    return updateSession({ url, nextUrl: new URL(url), cookies: { getAll: () => [], set() {} } });
  };
  const where = (r) => r.headers.get("location") && new URL(r.headers.get("location")).pathname;
  for (const path of ["/", "/admin", "/admin/users", "/admin/media", "/admin/votes", "/denied", "/anything"]) {
    const r = await run(path, null);
    assert.equal(r.status, 307, path);
    assert.equal(where(r), "/login", path);
  }
  for (const path of ["/login", "/auth/callback"]) assert.equal((await run(path, null)).status, 200, path);
  assert.equal((await run("/api/anything", null)).status, 401);
  assert.equal(where(await run("/login", USER)), "/admin");
  assert.equal((await run("/admin", USER)).status, 200, "signed-in passes the proxy; pages decide admin access");
  assert.equal((await run("/admin", USER)).headers.get("cache-control"), "private, no-store");
});

test("OAuth callback always lands on /admin (which re-checks) or /login, never a query-supplied URL", async () => {
  const load = (session) => loadModule("app/auth/callback/route.ts", { "@/lib/supabase/server": { createClient: async () => session.client } }).GET;
  const ok = await load(sessionClient())(new Request("https://admin.example/auth/callback?code=abc&next=https://evil.example"));
  assert.equal(ok.headers.get("location"), "/admin");
  const bad = await load(sessionClient({ error: { message: "bad code" } }))(new Request("https://admin.example/auth/callback?code=x"));
  assert.equal(bad.headers.get("location"), "/login");
  assert.equal((await load(sessionClient())(new Request("https://admin.example/auth/callback"))).headers.get("location"), "/login");
});

test("sign out ends this session locally and returns to /login", async () => {
  const session = sessionClient({ user: { id: ADMIN } });
  const { signOut } = loadModule("app/actions.ts", {
    "@/lib/supabase/server": { createClient: async () => session.client },
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
  });
  await assert.rejects(signOut(), /REDIRECT:\/login/);
  assert.deepEqual(plain(session.calls), [["signOut", { scope: "local" }]]);
});
