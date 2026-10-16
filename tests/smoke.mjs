import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";

// Live checks against a running admin server (TEST_ORIGIN, default local
// production server on :3001). Signed out only; creates and changes nothing.
const origin = process.env.TEST_ORIGIN || "http://localhost:3001";
const request = (path, options = {}) => fetch(new URL(path, origin), { redirect: "manual", ...options });
const where = (r) => new URL(r.headers.get("location"), origin).pathname;
const SECRET_MARKERS = /generation_prompt|\[system instruction\]|caption_lab_admins|@gmail\.com|@columbia\.edu|Registered users|AI captions|Ratings/;

test("the login page is public and shows no administrative data", async () => {
  const response = await request("/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Admin sign-in/);
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, SECRET_MARKERS);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
});

for (const path of ["/", "/admin", "/admin/users", "/admin/media", "/admin/votes", "/admin/media?q=a", "/denied"]) {
  test(`signed out ${path} reveals nothing and redirects to /login`, async () => {
    const response = await request(path);
    assert.ok([303, 307, 308].includes(response.status), `${path} ${response.status}`);
    assert.equal(where(response), "/login");
    assert.doesNotMatch(await response.text(), SECRET_MARKERS);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  });
}

test("a forged auth cookie does not get past the login wall", async () => {
  const forged = `base64-${Buffer.from(JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3MTNmNmY3Ny0xOWRkLTRkYmMtOWVkYy1mODExNGI5MjM3ZTQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.forged", refresh_token: "x" })).toString("base64url")}`;
  const response = await request("/admin", { headers: { cookie: `sb-msxlfmgpvyyrpvzrnqhu-auth-token=${forged}` } });
  assert.ok([303, 307].includes(response.status));
  assert.equal(where(response), "/login");
});

test("signed-out calls to every real admin Server Action are refused", async (t) => {
  const manifestPath = ".next/server/server-reference-manifest.json";
  if (!existsSync(manifestPath) || process.env.TEST_ORIGIN) return t.skip("needs the local build's action ids");
  const actions = Object.entries(JSON.parse(readFileSync(manifestPath, "utf8")).node);
  assert.equal(actions.length, 5);
  for (const [id, entry] of actions) {
    const response = await request("/admin/media", {
      method: "POST",
      headers: { "Next-Action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" },
      body: JSON.stringify([{ id: "44444444-4444-4444-8444-444444444444", path: "x" }]),
    });
    assert.ok([303, 307, 401].includes(response.status), `${entry.exportedName} -> ${response.status}`);
    assert.doesNotMatch(await response.text(), SECRET_MARKERS);
  }
});

test("the callback never redirects off-site", async () => {
  for (const query of ["", "?code=invalid", "?next=https://evil.example"]) {
    const response = await request(`/auth/callback${query}`, { headers: { "X-Forwarded-Host": "evil.example" } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/login");
  }
});

test("anonymous and signed-in REST clients cannot read admin membership", async (t) => {
  const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.startsWith("NEXT_PUBLIC_SUPABASE")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()])) : {};
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return t.skip("Supabase env not available");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
  assert.ok([401, 403].includes((await fetch(`${url}/rest/v1/caption_lab_admins?select=*`, { headers })).status));
  const grant = await fetch(`${url}/rest/v1/caption_lab_admins`, { method: "POST", headers, body: JSON.stringify({ user_id: "22222222-2222-4222-8222-222222222222", is_superadmin: true }) });
  assert.ok([401, 403].includes(grant.status));
});
