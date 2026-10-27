import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-ts.mjs";
import { ADMIN, CAPTION, privilegedClient } from "./helpers/fakes.mjs";

const path = `${ADMIN}/${CAPTION}.jpg`;

function setup(file, removal = { data: [], error: null }) {
  const db = privilegedClient(() => ({ data: null, error: null }), {
    download: { data: new Blob(["not an image"]), error: null },
  });
  const removals = [];
  const session = { storage: { from: bucket => ({ remove: async paths => {
    removals.push({ bucket, paths: Array.from(paths) });
    if (removal instanceof Error) throw removal;
    return removal;
  } }) } };
  const loaded = loadModule(file, {
    "server-only": {},
    "@/lib/auth": { assertAdmin: async () => ({ db: db.client, user: { id: ADMIN } }), AdminAccessError: class extends Error {} },
    "./server": { createClient: async () => session },
    "next/navigation": { redirect() { throw new Error("Unexpected redirect"); } },
    "next/cache": { revalidatePath() {} },
  });
  return { module: loaded, removals, privilegedRemovals: () => db.calls.filter(c => c[0] === "storage" && c[1] === "remove") };
}

test("invalid generation options cannot delete a registered image through the service role", async () => {
  // Storage RLS denies deletion by returning no deleted objects.
  const t = setup("app/admin/media/actions.ts");
  const result = await t.module.createAiCaption({ path, perspective: "invalid" });
  assert.equal(result.status, "error");
  assert.deepEqual(t.privilegedRemovals(), []);
  assert.deepEqual(t.removals, [{ bucket: "week4-media", paths: [path] }]);
});

test("invalid generation bytes are discarded through the session, with RLS enforced", async () => {
  const t = setup("app/admin/media/actions.ts", { data: [{ name: path }], error: null });
  const result = await t.module.createAiCaption({ path, perspective: "student" });
  assert.equal(result.status, "error");
  assert.deepEqual(t.privilegedRemovals(), []);
  assert.deepEqual(t.removals, [{ bucket: "week4-media", paths: [path] }]);
});

test("image registration does not claim cleanup when RLS refuses to remove the file", async () => {
  const t = setup("app/admin/images/actions.ts");
  const result = await t.module.registerImage({ path, title: "Test", alt_text: "Test" });
  assert.equal(result.status, "error");
  assert.doesNotMatch(result.message, /Invalid upload removed/);
  assert.deepEqual(t.privilegedRemovals(), []);
  assert.deepEqual(t.removals, [{ bucket: "week4-media", paths: [path] }]);
});

for (const [label, removal, removed] of [
  ["the exact file was removed", { data: [{ name: path }], error: null }, true],
  ["no file was removed", { data: [], error: null }, false],
  ["a different file was returned", { data: [{ name: "different.jpg" }], error: null }, false],
  ["Storage returned an error", { data: null, error: { message: "denied" } }, false],
  ["Storage could not be reached", new Error("network unavailable"), false],
]) test(`upload cleanup reports success only when ${label}`, async () => {
  const t = setup("lib/supabase/uploads.ts", removal);
  assert.equal(await t.module.discardUnregisteredUpload(path), removed);
  assert.deepEqual(t.privilegedRemovals(), []);
});
