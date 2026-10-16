import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-ts.mjs";
import { ADMIN, CAPTION, USER, adminLookup, plain, privilegedClient, sessionClient } from "./helpers/fakes.mjs";

// Media CRUD Server Actions with the REAL lib/auth.ts in front of them.
// Gemini is always mocked: no network, no quota.

const PATH = `${ADMIN}/55555555-5555-4555-8555-555555555555.jpg`;
const ALT = "A slice of pizza on a paper plate.";
const gemini = (captions) => async () => new Response(JSON.stringify({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ alt_text: ALT, captions }) }] } }],
}), { status: 200 });

function load({ who = "admin", respond = () => ({ data: null, error: null }), fetchImpl = gemini(["Dollar slice, hundred-dollar regret."]) } = {}) {
  const session = who === "anonymous" ? sessionClient() : sessionClient({ user: { id: who === "admin" ? ADMIN : USER, email: "x@example.com" } });
  const db = privilegedClient(adminLookup(who === "admin" ? true : who === "denied" ? false : null, respond));
  const revalidated = [];
  const geminiRequests = [];
  const actions = loadModule("app/admin/media/actions.ts", {
    "server-only": {},
    "./supabase/server": { createClient: async () => session.client },
    "./supabase/privileged": { createPrivilegedClient: () => db.client },
    "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
  }, {
    fetch: async (...args) => { geminiRequests.push(args); return fetchImpl(...args); },
    env: { GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "gemini-3.8-flash" },
  });
  const work = () => db.calls.filter((c) => c[0] !== "caption_lab_admins");
  return { actions, db, work, revalidated, geminiRequests };
}

const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const IDLE = { status: "idle", message: "" };

// ---- Authorization gate: every action, every non-admin caller ------------
for (const who of ["anonymous", "denied"]) {
  test(`${who} callers are rejected by every media action before any database, storage, or Gemini work`, async () => {
    const t = load({ who });
    const results = [
      await t.actions.prepareAdminUpload({ type: "image/jpeg", size: 10, name: "a.jpg" }),
      await t.actions.createAiCaption({ path: PATH, perspective: "student" }),
      await t.actions.updateCaption(IDLE, form({ id: CAPTION, caption: "New text", perspective: "student", tone: "" })),
      await t.actions.deleteCaption(IDLE, form({ id: CAPTION })),
    ];
    for (const result of results) {
      assert.equal(result.status, "error");
      assert.match(result.message, who === "anonymous" ? /Sign in again/ : /does not have admin access/);
    }
    assert.deepEqual(t.work(), [], "no privileged work");
    assert.equal(t.geminiRequests.length, 0);
    assert.equal(t.revalidated.length, 0);
  });
}

// ---- CREATE -----------------------------------------------------------------
test("prepareAdminUpload puts the photo in the verified admin's own folder", async () => {
  const result = await load().actions.prepareAdminUpload({ type: "image/png", size: 100, name: "a.png", userId: USER });
  assert.equal(result.status, "ok");
  assert.match(result.path, new RegExp(`^${ADMIN}/[0-9a-f-]{36}\\.png$`));
  assert.match((await load().actions.prepareAdminUpload({ type: "image/gif", size: 1, name: "a.gif" })).message, /JPEG, PNG, or WebP/);
});

test("createAiCaption generates one caption with Gemini and saves it with the admin as creator", async () => {
  const t = load({ respond: (table, ops) => (table === "ai_captions" && ops[0][0] === "insert" ? { data: [{ id: CAPTION, caption: "Dollar slice, hundred-dollar regret." }], error: null } : { data: null, error: null }) });
  const result = await t.actions.createAiCaption({ path: PATH, context: "2am pizza", tone: "dry", perspective: "professor", creator_id: USER });
  assert.equal(result.status, "ok", result.message);
  assert.equal(result.id, CAPTION);
  assert.equal(t.geminiRequests.length, 1);
  const insert = t.db.calls.find((c) => c[0] === "ai_captions" && c[1] === "insert")[2];
  assert.equal(insert.length, 1);
  const row = plain(insert[0]);
  assert.equal(row.creator_id, ADMIN, "creator comes from the verified session, not input");
  assert.equal(row.source_image_path, PATH);
  assert.equal(row.caption, "Dollar slice, hundred-dollar regret.");
  assert.equal(row.perspective, "professor");
  assert.equal(row.tone, "dry");
  assert.equal(row.user_context, "2am pizza");
  assert.equal(row.model, "gemini-3.8-flash");
  assert.equal(row.image_alt, ALT);
  assert.match(row.generation_prompt, /\[system instruction\][\s\S]*Write 1 caption for the attached photo, at most 10 words\.[\s\S]*Perspective: Professor/);
  assert.deepEqual(t.revalidated, ["/admin"]);
});

test("createAiCaption never saves an over-long caption: bounded retry, then cleanup", async () => {
  const t = load({ fetchImpl: gemini(["one two three four five six seven eight nine ten eleven"]) });
  const result = await t.actions.createAiCaption({ path: PATH, perspective: "student" });
  assert.equal(result.status, "error");
  assert.match(result.message, /10 words/);
  assert.equal(t.geminiRequests.length, 2, "one retry, then give up");
  assert.ok(!t.db.calls.some((c) => c[1] === "insert"));
  assert.ok(t.db.calls.some((c) => c[0] === "storage" && c[1] === "remove"));
});

test("createAiCaption only accepts the admin's own upload path", async () => {
  for (const path of [PATH.replace(ADMIN, USER), `${ADMIN}/../x.jpg`, "https://evil.example/a.jpg", undefined]) {
    const t = load();
    assert.equal((await t.actions.createAiCaption({ path, perspective: "student" })).status, "error");
    assert.equal(t.geminiRequests.length, 0);
    assert.ok(!t.db.calls.some((c) => c[0] === "storage" || c[1] === "insert"));
  }
});

// ---- UPDATE -----------------------------------------------------------------
test("updateCaption saves only caption, perspective, and tone for that id", async () => {
  const t = load({ respond: (table, ops) => (ops.some(([op]) => op === "update") ? { data: { id: CAPTION }, error: null } : { data: null, error: null }) });
  const result = await t.actions.updateCaption(IDLE, form({ id: CAPTION, caption: "  Fresh   admin edit, ten words or fewer  ", perspective: "professor", tone: "chaotic", creator_id: USER }));
  assert.equal(result.status, "ok", result.message);
  const update = t.db.calls.find((c) => c[1] === "update");
  assert.deepEqual(plain(update), ["ai_captions", "update", { caption: "Fresh admin edit, ten words or fewer", perspective: "professor", tone: "chaotic" }]);
  assert.deepEqual(plain(t.db.calls.find((c) => c[1] === "eq" && c[0] === "ai_captions")), ["ai_captions", "eq", "id", CAPTION]);
  assert.deepEqual(t.revalidated, ["/admin"]);
});

for (const [label, fields, pattern] of [
  ["eleven words", { caption: "one two three four five six seven eight nine ten eleven" }, /at most 10 words \(this one has 11\)/],
  ["empty caption", { caption: "   " }, /Write a caption/],
  ["over 200 characters", { caption: "x".repeat(201) }, /under 200 characters/],
  ["unknown perspective", { perspective: "teacher" }, /Student or Professor/],
  ["unknown tone", { tone: "mean" }, /valid tone/],
  ["bad id", { id: "1 or 1=1" }, /Unknown caption/],
]) test(`updateCaption rejects ${label} before touching the database`, async () => {
  const t = load();
  const result = await t.actions.updateCaption(IDLE, form({ id: CAPTION, caption: "Fine caption", perspective: "student", tone: "", ...fields }));
  assert.equal(result.status, "error");
  assert.match(result.message, pattern);
  assert.ok(!t.db.calls.some((c) => c[1] === "update"));
});

test("updateCaption reports the database's ten-word check and missing rows", async () => {
  const check = load({ respond: (table, ops) => (ops.some(([op]) => op === "update") ? { data: null, error: { code: "23514" } } : { data: null, error: null }) });
  assert.match((await check.actions.updateCaption(IDLE, form({ id: CAPTION, caption: "ok", perspective: "student" }))).message, /at most 10 words/);
  const gone = load({ respond: () => ({ data: null, error: null }) });
  assert.match((await gone.actions.updateCaption(IDLE, form({ id: CAPTION, caption: "ok", perspective: "student" }))).message, /no longer exists/);
});

// ---- DELETE -----------------------------------------------------------------
function deleteScenario(remainingUses) {
  return load({
    respond: (table, ops) => {
      const ops0 = ops.map(([op]) => op);
      if (table === "ai_captions" && ops0.includes("delete")) return { data: [{ id: CAPTION }], error: null };
      if (table === "ai_captions" && ops0.includes("maybeSingle")) return { data: { id: CAPTION, source_image_path: PATH }, error: null };
      if (table === "caption_votes") return { count: 3, error: null };
      if (table === "ai_captions") return { count: remainingUses, error: null };
      return { data: null, error: null };
    },
  });
}

test("deleteCaption deletes the row (votes cascade) and keeps a photo other captions still use", async () => {
  const t = deleteScenario(2);
  // Success reports at page level: the deleted row's card no longer exists.
  await assert.rejects(t.actions.deleteCaption(IDLE, form({ id: CAPTION })), /REDIRECT:\/admin\/media\?deleted=1&votes=3&photo=kept$/);
  assert.deepEqual(plain(t.db.calls.filter((c) => c[0] === "ai_captions" && c[1] === "eq")[1]), ["ai_captions", "eq", "id", CAPTION]);
  assert.ok(t.db.calls.some((c) => c[0] === "ai_captions" && c[1] === "delete"));
  assert.ok(!t.db.calls.some((c) => c[0] === "storage"), "shared photo untouched");
  assert.ok(!t.db.calls.some((c) => c[0] === "caption_votes" && ["delete", "update", "insert"].includes(c[1])), "votes never mutated directly");
});

test("deleteCaption removes the photo only when nothing references it any more", async () => {
  const t = deleteScenario(0);
  await assert.rejects(t.actions.deleteCaption(IDLE, form({ id: CAPTION })), /REDIRECT:\/admin\/media\?deleted=1&votes=3&photo=removed$/);
  assert.deepEqual(plain(t.db.calls.find((c) => c[0] === "storage")), ["storage", "remove", "week4-media", [PATH]]);
});

test("deleteCaption rejects bad ids and reports already-deleted captions", async () => {
  assert.match((await load().actions.deleteCaption(IDLE, form({ id: "*" }))).message, /Unknown caption/);
  assert.match((await load().actions.deleteCaption(IDLE, form({ id: CAPTION }))).message, /already deleted/);
});
