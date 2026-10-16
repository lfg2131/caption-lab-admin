import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { loadModule } from "./helpers/load-ts.mjs";
import { ADMIN, CAPTION, USER, privilegedClient } from "./helpers/fakes.mjs";

// Admin pages rendered with the real React renderer and the real data loaders
// over a fake privileged client. Shows (1) nothing loads without admin access,
// (2) pages render real values from the database responses.
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const ui = {
  react: React,
  "react/jsx-runtime": require("react/jsx-runtime"),
  "server-only": {},
  "next/image": { __esModule: true, default: ({ src, alt }) => React.createElement("img", { src, alt }) },
  "next/link": { __esModule: true, default: ({ href, className, children }) => React.createElement("a", { href, className }, children) },
  "next/navigation": { usePathname: () => "/admin", useRouter: () => ({ refresh() {} }) },
  "@/lib/supabase/client": { createClient: () => ({}) },
};
const IMG = `${USER}/66666666-6666-4666-8666-666666666666.jpg`;
const now = new Date().toISOString();
const users = [
  { id: ADMIN, email: "owner@example.com", created_at: "2026-08-07T15:45:11Z", last_sign_in_at: now, user_metadata: { full_name: "Owner Admin" }, app_metadata: { provider: "google" } },
  { id: USER, email: "student@example.com", created_at: "2026-09-28T20:23:42Z", last_sign_in_at: null, user_metadata: {}, app_metadata: { provider: "google" } },
];
const caption = { id: CAPTION, batch_id: CAPTION, caption: "Attendance today: me and the projector.", source_image_path: IMG, image_alt: "A lecture hall.", tone: "dry", perspective: "professor", model: "gemini-3.8-flash", generation_prompt: "[system instruction]\nsecret-ish prompt", user_context: null, creator_id: USER, created_at: now };

function respond(table, ops) {
  const names = ops.map(([op]) => op);
  const head = ops.find(([op, , options]) => op === "select" && options?.head);
  const eqVote = ops.find(([op, column]) => op === "eq" && column === "vote");
  const eqPerspective = ops.find(([op, column]) => op === "eq" && column === "perspective");
  if (head) {
    if (table === "profiles") return { count: 2, error: null };
    if (table === "ai_captions") return { count: eqPerspective ? (eqPerspective[2] === "professor" ? 1 : 0) : 1, error: null };
    if (table === "caption_votes") return { count: eqVote ? (eqVote[2] === 1 ? 2 : 1) : 3, error: null };
  }
  if (table === "profiles") return { data: [{ id: USER, username: "student1", name: null, first_name: "Sam", last_name: "Student", created_at: now }], error: null };
  if (table === "ai_captions" && names.includes("range")) return { data: [caption], count: 1, error: null };
  if (table === "caption_votes" && names.includes("range")) return { data: [{ id: "v1", vote: 1, user_id: ADMIN, caption_id: CAPTION, created_at: now, ai_captions: { caption: caption.caption, perspective: "professor" } }], count: 1, error: null };
  if (table === "caption_votes" && names.includes("limit") && ops.find(([op]) => op === "select")[1].includes("ai_captions")) {
    return { data: [{ id: "v1", vote: -1, user_id: ADMIN, created_at: now, ai_captions: { caption: caption.caption } }], error: null };
  }
  if (table === "ai_captions") return { data: [{ ...caption }], error: null };
  if (table === "caption_votes") return { data: [{ caption_id: CAPTION, vote: 1, user_id: ADMIN, created_at: now }, { caption_id: CAPTION, vote: -1, user_id: ADMIN, created_at: now }], error: null };
  return { data: [], error: null };
}

function render(page, { admin = true, searchParams = {} } = {}) {
  const db = privilegedClient(respond, { users });
  const Page = loadModule(page, {
    ...ui,
    "@/lib/auth": { requireAdmin: async () => { if (!admin) throw new Error("REDIRECT:/denied"); return { status: "admin", user: { id: ADMIN, email: "owner@example.com" }, db: db.client }; } },
    "./actions": { createAiCaption: async () => ({}), prepareAdminUpload: async () => ({}), updateCaption: async () => ({}), deleteCaption: async () => ({}) },
  }).default;
  return { db, html: async () => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(searchParams) })) };
}

for (const page of ["app/admin/page.tsx", "app/admin/users/page.tsx", "app/admin/media/page.tsx", "app/admin/votes/page.tsx"]) {
  test(`${page}: without admin access nothing is loaded`, async () => {
    const t = render(page, { admin: false });
    await assert.rejects(t.html(), /REDIRECT:\/denied/);
    assert.equal(t.db.calls.length, 0);
  });
}

test("Overview shows real statistics: users, captions, images, votes, Funny split, activity", async () => {
  const html = await render("app/admin/page.tsx").html();
  assert.match(html, /Registered users<\/p><p[^>]*>2<\/p><p[^>]*>2 with a profile/);
  assert.match(html, /AI captions<\/p><p[^>]*>1<\/p><p[^>]*>0 student · 1 professor/);
  assert.match(html, /Image posts<\/p><p[^>]*>1</);
  assert.match(html, /Votes<\/p><p[^>]*>3<\/p><p[^>]*>3\.0 per caption/);
  assert.match(html, /2 Funny \(67%\), 1 Not funny \(33%\)/);
  assert.match(html, /Captions generated per day/);
  assert.match(html, /Votes cast per day/);
  assert.match(html, /<table class="sr-only">/, "chart data has a table view");
  assert.match(html, /Attendance today: me and the projector\./);
});

test("Users lists accounts with profile fields and activity, read-only", async () => {
  const html = await render("app/admin/users/page.tsx").html();
  for (const text of ["owner@example.com", "student@example.com", "Sam Student", "@student1", "Owner Admin", "No profile"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<button[^>]*>(Delete|Edit|Ban|Make admin)/i);
  const filtered = await render("app/admin/users/page.tsx", { searchParams: { q: "sam" } }).html();
  assert.ok(filtered.includes("student@example.com") && !filtered.includes("owner@example.com"));
});

test("Media lists captions with image, perspective, tone, creator, prompt, model, votes, and edit/delete", async () => {
  const t = render("app/admin/media/page.tsx");
  const html = await t.html();
  assert.match(html, new RegExp(`<img src="https://signed.example/${IMG}" alt="A lecture hall\\."`));
  for (const text of ["Attendance today: me and the projector.", "Professor perspective", "dry", "student@example.com", "gemini-3.8-flash", "Generation prompt", "secret-ish prompt", "😂 1 · 😐 1", "Create an AI caption", "Delete…", "Save changes"]) assert.ok(html.includes(text), text);
});

test("Votes lists each vote with caption, voter, time, and filters", async () => {
  const t = render("app/admin/votes/page.tsx", { searchParams: { vote: "funny", sort: "oldest" } });
  const html = await t.html();
  assert.match(html, /😂 Funny<\/span>/);
  assert.match(html, /Attendance today: me and the projector\./);
  assert.match(html, /Owner Admin/);
  assert.ok(t.db.calls.some((c) => c[0] === "caption_votes" && c[1] === "eq" && c[2] === "vote" && c[3] === 1));
  assert.ok(t.db.calls.some((c) => c[0] === "caption_votes" && c[1] === "order" && c[3]?.ascending === true));
  assert.ok(!t.db.calls.some((c) => c[0] === "caption_votes" && ["insert", "update", "delete"].includes(c[1])));
});

test("data helpers: daily buckets in New York time, pagination, search", () => {
  const data = loadModule("lib/data.ts", { "server-only": {} });
  const days = data.bucketByDay(["2026-10-16T15:00:00Z", "2026-10-16T03:00:00Z"], ["2026-10-15T15:00:00Z"], new Date("2026-10-16T18:00:00Z"), 3);
  assert.deepEqual(JSON.parse(JSON.stringify(days)), [
    { day: "2026-10-14", captions: 0, votes: 0 },
    { day: "2026-10-15", captions: 1, votes: 1 },
    { day: "2026-10-16", captions: 1, votes: 0 },
  ]);
  const page = data.paginate(Array.from({ length: 30 }, (_, i) => i), 9);
  assert.equal(page.page, 2);
  assert.equal(page.rows.length, 5);
  assert.ok(data.matchesSearch(["Sam", null], "sa"));
  assert.ok(!data.matchesSearch(["Sam"], "zz"));
});

test("Media shows a page-level delete confirmation built from validated values only", async () => {
  const html = await render("app/admin/media/page.tsx", { searchParams: { deleted: "1", votes: "3", photo: "removed" } }).html();
  assert.match(html, /Caption deleted, along with its 3 votes\. Its photo was no longer used and was removed from storage\./);
  const odd = await render("app/admin/media/page.tsx", { searchParams: { deleted: "1", votes: "<script>", photo: "<b>x</b>" } }).html();
  const notice = odd.match(/<p role="status" class="alert-success">([^<]*)<\/p>/)[1];
  assert.equal(notice, "Caption deleted, along with its 0 votes.");
  assert.doesNotMatch(odd, /&lt;script&gt;|&lt;b&gt;x|<b>x/);
  assert.doesNotMatch(await render("app/admin/media/page.tsx").html(), /Caption deleted/);
});

test("Caption editor is fully controlled and restarts from the saved row after each save", () => {
  const { CaptionEditor } = loadModule("app/admin/media/caption-editor.tsx", { ...ui, "./actions": { updateCaption: async () => ({}) } });
  const html = renderToStaticMarkup(React.createElement(CaptionEditor, { id: CAPTION, caption: "Saved text", perspective: "student", tone: "dry" }));
  assert.match(html, /<option value="student" selected="">/);
  assert.match(html, /<option value="dry" selected="">/);
  assert.doesNotMatch(html, /defaultValue/);
  const page = require("node:fs").readFileSync("app/admin/media/page.tsx", "utf8");
  assert.match(page, /<CaptionEditor key=\{`\$\{row\.caption\}\|\$\{row\.perspective\}\|\$\{row\.tone\}`\}/);
});
