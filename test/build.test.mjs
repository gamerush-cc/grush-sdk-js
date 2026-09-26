import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";

import * as esm from "../grush-sdk.mjs";

const pkg = createRequire(import.meta.url)("../package.json");
const iife = fs.readFileSync(new URL("../grush-sdk.js", import.meta.url), "utf8");

function runClassicScript(context) {
  vm.runInContext(iife, vm.createContext(context));
  return context;
}

test("the classic script exposes GRush and GRushSdk without module syntax", () => {
  const context = runClassicScript({ setTimeout, TextEncoder, TextDecoder, structuredClone });
  assert.equal(context.GRush, context.GRushSdk);
  assert.equal(context.GRush.VERSION, pkg.version);
  assert.equal(typeof context.GRush.leaderboards.submit, "function");
});

test("the classic script never overwrites an existing GRush global", () => {
  const existing = { mine: true };
  const context = runClassicScript({ GRush: existing, setTimeout, TextEncoder, TextDecoder });
  assert.equal(context.GRush, existing);
  assert.equal(typeof context.GRushSdk.net.join, "function");
});

test("the ESM build exports the same API", () => {
  assert.equal(esm.default, esm.GRush);
  assert.equal(esm.VERSION, pkg.version);
  assert.equal(typeof esm.createGRush, "function");
  assert.equal(esm.CODES.signInRequired, "signInRequired");
});
