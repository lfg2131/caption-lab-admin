import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter((p) => p && existsSync(p));
const appFiles = files.filter((p) => /^(app|lib)\//.test(p) && /\.(tsx?|mjs)$/.test(p));
const isClient = (p) => /^\s*["']use client["']/.test(read(p));

test("the service-role key is read in exactly one server-only module", () => {
  const users = appFiles.filter((p) => read(p).includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.deepEqual(users, ["lib/supabase/privileged.ts"]);
  assert.match(read("lib/supabase/privileged.ts"), /^import "server-only";/);
  for (const path of ["lib/auth.ts", "lib/data.ts"]) assert.match(read(path), /^import "server-only";/, path);
  const all = files.filter((p) => !p.startsWith("tests/")).map(read).join("\n");
  assert.doesNotMatch(all, /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/);
});

test("client components never import privileged code or secrets", () => {
  for (const path of appFiles.filter(isClient)) {
    const source = read(path);
    assert.doesNotMatch(source, /supabase\/privileged|@\/lib\/auth|@\/lib\/data|captions\/gemini|captions\/prompt|process\.env\.(?!NEXT_PUBLIC_)|service_role/, path);
  }
});

test("every admin page and the admin layout call requireAdmin() first", () => {
  const pages = files.filter((p) => /^app\/admin\/(.*\/)?(page|layout)\.tsx$/.test(p));
  assert.equal(pages.length, 5);
  for (const path of pages) {
    const body = read(path).split(/export default async function \w+\([^)]*\)[^{]*\{/)[1];
    assert.ok(body, `${path} exports an async page`);
    assert.match(body.trimStart(), /^const \{[^}]*\} = await requireAdmin\(\);/, path);
  }
});

test("every exported Server Action calls assertAdmin() before anything else", () => {
  const source = read("app/admin/media/actions.ts");
  const actions = [...source.matchAll(/export async function (\w+)\([^\n]*\{\n([^\n]*)\n([^\n]*)/g)];
  assert.deepEqual(actions.map((m) => m[1]), ["prepareAdminUpload", "createAiCaption", "updateCaption", "deleteCaption"]);
  for (const [, name, first, second] of actions) {
    assert.match(`${first}\n${second}`, /let admin;\n\s*try \{ admin = await assertAdmin\(\); \} catch \(error\) \{ return denied\(error\); \}/, name);
  }
});

test("no user/profile/vote/admin-membership mutations exist anywhere in the app", () => {
  const source = appFiles.map(read).join("\n");
  assert.doesNotMatch(source, /auth\.admin\.(deleteUser|updateUserById|createUser|inviteUserByEmail)/);
  assert.doesNotMatch(source, /from\("(profiles|caption_votes|caption_lab_admins)"\)\s*\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML\s*=|confirm\(|alert\(/);
});

test("profiles: only display columns are read", () => {
  const selects = [...read("lib/data.ts").matchAll(/from\("profiles"\)\.select\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(selects, ["id", "id, username, name, first_name, last_name, created_at"]);
});

test("OAuth: exact callback, fixed redirects, no hardcoded admin identity", () => {
  assert.match(read("app/login/google-sign-in.tsx"), /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
  const source = appFiles.map(read).join("\n");
  assert.doesNotMatch(source, /@gmail\.com|@columbia\.edu|713f6f77|ADMIN_EMAIL|isAdmin\s*=\s*true/);
  assert.match(read("lib/auth.ts"), /data\?\.is_superadmin !== true/);
});

test("no credentials in tracked files; env files are ignored", () => {
  for (const path of files.filter((p) => !/\.(ico|png|jpe?g|webp)$/.test(p))) {
    const content = read(path);
    assert.doesNotMatch(content, /sb_secret_[\w-]{10,}|GOCSPX-[\w-]+|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/, path);
    // JWTs: only the smoke test's deliberately forged, unsigned user token may appear.
    for (const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      assert.notEqual(payload.role, "service_role", `service-role JWT in ${path}`);
      assert.ok(path === "tests/smoke.mjs" && token.endsWith(".forged"), `unexpected JWT in ${path}`);
    }
  }
  assert.ok(!files.some((p) => p.startsWith(".env") && p !== ".env.example"));
  assert.ok(readdirSync(".").filter((p) => p.startsWith(".env") && p !== ".env.example").every((p) => execFileSync("git", ["check-ignore", p], { encoding: "utf8" }).trim() === p));
});
