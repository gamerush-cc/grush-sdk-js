import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { createGRush } from "../src/sdk.js";

const RUNTIME_NAMES = ["Info", "Player", "Locale"];

let sdk;

function installRuntime(locale, protocolVersion = 4) {
  globalThis.GRushInfo = { protocolVersion };
  globalThis.GRushPlayer = { getSelf: () => Promise.resolve({ pseudoId: "p1", isGuest: true }) };
  if (locale) globalThis.GRushLocale = locale;
}

function fakeLocale(state) {
  const listeners = [];
  return {
    listeners,
    current: () => state,
    get: () => Promise.resolve(state),
    onChange(handler) {
      listeners.push(handler);
      return () => listeners.splice(listeners.indexOf(handler), 1);
    },
  };
}

const JA = { locale: "ja", source: "user", languages: ["ja", "en-US"] };

beforeEach(() => {
  sdk = createGRush();
});

afterEach(() => {
  for (const name of RUNTIME_NAMES) {
    delete globalThis[`GRush${name}`];
    delete globalThis[`GameRush${name}`];
  }
  delete globalThis.location;
});

test("locale.get and current read the runtime and copy the languages", async () => {
  const runtime = fakeLocale({ ...JA, languages: [...JA.languages] });
  installRuntime(runtime);
  const result = await sdk.locale.get();
  assert.deepEqual(result, { ok: true, value: JA, code: "", message: "" });
  result.value.languages.push("xx");
  const current = sdk.locale.current();
  assert.deepEqual(current, JA);
  current.languages.push("yy");
  assert.deepEqual(runtime.current().languages, ["ja", "en-US"]);
});

test("locale keeps a source it does not know instead of dropping the value", async () => {
  installRuntime(fakeLocale({ locale: "fr", source: "future", languages: ["fr"] }));
  const result = await sdk.locale.get();
  assert.equal(result.ok, true);
  assert.equal(result.value.source, "future");
  assert.equal(sdk.locale.current().locale, "fr");
});

test("locale.onChange forwards copies and unsubscribes", () => {
  const runtime = fakeLocale(JA);
  installRuntime(runtime);
  const seen = [];
  const stop = sdk.locale.onChange((value) => seen.push(value));
  runtime.listeners[0]({ locale: "en", source: "system", languages: ["en"] });
  runtime.listeners[0]({ locale: 1 });
  assert.deepEqual(seen, [{ locale: "en", source: "system", languages: ["en"] }]);
  stop();
  assert.equal(runtime.listeners.length, 0);
  assert.equal(typeof sdk.locale.onChange("nope"), "function");
});

test("locale is unsupported below protocol 4 without breaking the rest", async () => {
  const runtime = fakeLocale(JA);
  installRuntime(runtime, 3);
  assert.equal((await sdk.locale.get()).code, "unsupported");
  assert.equal(sdk.locale.current(), null);
  sdk.locale.onChange(() => assert.fail("must not subscribe"))();
  assert.equal(runtime.listeners.length, 0);
  assert.equal((await sdk.player.getSelf()).ok, true);
});

test("locale is unsupported when the runtime has no GRushLocale", async () => {
  installRuntime(null);
  assert.equal((await sdk.locale.get()).code, "unsupported");
  assert.equal(sdk.locale.current(), null);
  sdk.locale.onChange(() => {})();
});

test("the GameRushLocale alias is accepted too", () => {
  installRuntime(null);
  globalThis.GameRushLocale = fakeLocale(JA);
  assert.equal(sdk.locale.current().locale, "ja");
});

test("the mock uses the configured locale or the device languages", async () => {
  globalThis.location = { protocol: "http:", hostname: "localhost" };
  assert.equal(sdk.backend, "mock");
  const device = await sdk.locale.get();
  assert.equal(device.ok, true);
  assert.equal(device.value.source, "device");
  assert.ok(device.value.languages.length >= 1);

  sdk.mock.config.locale = "en-GB";
  const user = await sdk.locale.get();
  assert.equal(user.value.locale, "en-GB");
  assert.equal(user.value.source, "user");
  assert.equal(user.value.languages[0], "en-GB");
  assert.equal(sdk.locale.current().locale, "en-GB");

  sdk.mock.reset();
  assert.equal(sdk.mock.config.locale, null);
  assert.equal(typeof sdk.locale.onChange(() => {}), "function");
});

test("outside GameRush locale degrades to unsupported", async () => {
  globalThis.location = { protocol: "https:", hostname: "example.com" };
  assert.equal((await sdk.locale.get()).code, "unsupported");
  assert.equal(sdk.locale.current(), null);
  sdk.locale.onChange(() => {})();
});
