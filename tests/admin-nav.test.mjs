import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { loadModule } from "./helpers/load-ts.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(pathname) {
  return loadModule("app/admin/admin-nav.tsx", {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { __esModule: true, default: ({ href, className, children, ...rest }) => React.createElement("a", { href, className, ...rest }, children) },
    "next/navigation": { usePathname: () => pathname },
  });
}
const render = (pathname) => { const m = load(pathname); return renderToStaticMarkup(React.createElement(m.AdminNav)); };
const list = (html, label) => html.match(new RegExp(`aria-controls="([^"]*-${label.toLowerCase()})"`))[1];

test("every existing admin page remains in the navigation (16 links)", () => {
  const html = render("/admin");
  const hrefs = [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 16);
  for (const h of ["/admin", "/admin/users", "/admin/media", "/admin/images", "/admin/votes", "/admin/chains", "/admin/steps", "/admin/mix", "/admin/terms", "/admin/examples", "/admin/requests", "/admin/responses", "/admin/models", "/admin/providers", "/admin/signup-domains", "/admin/whitelist"]) assert.ok(hrefs.includes(h), h);
});

test("Activity is visible; Generation and Settings are collapsed by default with accessible buttons", () => {
  const html = render("/admin");
  assert.match(html, /<h2[^>]*>Activity<\/h2>/);
  assert.doesNotMatch(html.match(/<ul id="[^"]*"[^>]*>(?=<li><a href="\/admin")/)?.[0] ?? "", /hidden/);
  for (const label of ["Generation", "Settings"]) {
    const id = list(html, label);
    assert.match(html, new RegExp(`<button type="button" aria-expanded="false" aria-controls="${id}"`));
    assert.match(html, new RegExp(`<ul id="${id}" hidden=""`));
  }
});

test("Activity has no disclosure button", () => {
  assert.equal((render("/admin").match(/<button/g) ?? []).length, 2);
});

test("A page inside Generation opens only Generation and marks the page current", () => {
  const html = render("/admin/requests/abc");
  assert.match(html, /aria-expanded="true" aria-controls="[^"]*-generation"/);
  assert.match(html, /aria-expanded="false" aria-controls="[^"]*-settings"/);
  assert.match(html, /<a href="\/admin\/requests" class="[^"]*" aria-current="page"/);
  assert.doesNotMatch(html, new RegExp(`<ul id="${list(html, "Generation")}" hidden`));
});

test("A page inside Settings opens only Settings; Overview is exact-match only", () => {
  const html = render("/admin/models");
  assert.match(html, /aria-expanded="true" aria-controls="[^"]*-settings"/);
  assert.match(html, /aria-expanded="false" aria-controls="[^"]*-generation"/);
  const home = render("/admin/users");
  assert.doesNotMatch(home, /<a href="\/admin" class="[^"]*" aria-current/);
  assert.match(home, /<a href="\/admin\/users" class="[^"]*" aria-current="page"/);
});

test("initialOpen and isActive helpers", () => {
  const m = load("/admin");
  assert.deepEqual({ ...m.initialOpen("/admin") }, { Generation: false, Settings: false });
  assert.deepEqual({ ...m.initialOpen("/admin/mix") }, { Generation: true, Settings: false });
  assert.equal(m.isActive("/admin/votes/1", "/admin"), false);
});
