import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { createGRush } from "../src/sdk.js";

const RUNTIME_NAMES = ["Info", "Player", "Share"];

function rejection(code, message) {
  return Promise.reject(Object.assign(new Error(message), { code }));
}

let sdk;
let calls;

function installRuntime(share, protocolVersion = 3) {
  globalThis.GRushInfo = { protocolVersion };
  globalThis.GRushPlayer = { getSelf: () => Promise.resolve({ pseudoId: "p1", isGuest: true }) };
  if (share) globalThis.GRushShare = share;
}

function recordingShare(status = "opened", available = true) {
  return {
    share: (options) => {
      calls.push(options);
      return Promise.resolve({ status });
    },
    isAvailable: () => Promise.resolve(available),
  };
}

beforeEach(() => {
  calls = [];
  sdk = createGRush();
});

afterEach(() => {
  for (const name of RUNTIME_NAMES) {
    delete globalThis[`GRush${name}`];
    delete globalThis[`GameRush${name}`];
  }
  delete globalThis.location;
});

test("share rejects a bare string instead of options without calling the runtime", async () => {
  installRuntime(recordingShare());
  const before = calls.length;
  const result = await sdk.share.share("clear");
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalidParams");
  assert.equal(calls.length, before);
});

test("share passes the options through to the runtime unchanged", async () => {
  installRuntime(recordingShare());
  const image = new Uint8Array([1, 2, 3]);
  const shared = await sdk.share.share({ text: "clear", image });
  assert.deepEqual(shared, { ok: true, value: { status: "opened" }, code: "", message: "" });
  assert.deepEqual(calls.at(-1), { text: "clear", image });
  assert.equal((await sdk.share.share({ image: "screen" })).value.status, "opened");
  assert.deepEqual(calls.at(-1), { image: "screen" });
  assert.equal((await sdk.share.share()).ok, true);
  assert.deepEqual(calls.at(-1), {});
  assert.equal(await sdk.share.isAvailable(), true);
});

test("share returns cancelled as a success", async () => {
  installRuntime(recordingShare("cancelled", false));
  assert.deepEqual((await sdk.share.share({ text: "x" })).value, { status: "cancelled" });
  assert.equal(await sdk.share.isAvailable(), false);
});

test("share rejections become result codes", async () => {
  installRuntime({
    share: () => rejection("invalidParams", "Share text must not contain links."),
    isAvailable: () => Promise.resolve(true),
  });
  const rejected = await sdk.share.share({ text: "https://example.com" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "invalidParams");

  globalThis.GRushShare.share = () => rejection("rateLimited", "slow down");
  assert.equal((await sdk.share.share()).code, "rateLimited");

  globalThis.GRushShare.share = () => rejection("unsupportedMethod", "old host");
  assert.equal((await sdk.share.share()).code, "unsupported");
});

test("share is unsupported below protocol 3 without breaking the rest", async () => {
  installRuntime(recordingShare(), 2);
  assert.equal((await sdk.share.share({ text: "x" })).code, "unsupported");
  assert.equal(await sdk.share.isAvailable(), false);
  assert.equal(calls.length, 0);
  assert.equal((await sdk.player.getSelf()).ok, true);
});

test("share is unsupported when the runtime has no GRushShare", async () => {
  installRuntime(null);
  assert.equal((await sdk.share.share({ text: "x" })).code, "unsupported");
  assert.equal(await sdk.share.isAvailable(), false);
});

test("the GameRushShare alias is accepted too", async () => {
  installRuntime(null);
  globalThis.GameRushShare = recordingShare();
  assert.equal((await sdk.share.share({ text: "x" })).value.status, "opened");
});

test("the mock returns the status the author picked", async () => {
  globalThis.location = { protocol: "http:", hostname: "localhost" };
  assert.equal(sdk.backend, "mock");
  assert.equal(await sdk.share.isAvailable(), true);
  assert.equal((await sdk.share.share({ text: "x", image: "screen" })).value.status, "opened");

  sdk.mock.config.shareStatus = "cancelled";
  assert.equal((await sdk.share.share()).value.status, "cancelled");

  sdk.mock.config.shareAvailable = false;
  assert.equal(await sdk.share.isAvailable(), false);
  assert.equal((await sdk.share.share()).code, "unavailable");

  sdk.mock.reset();
  assert.equal(sdk.mock.config.shareStatus, "opened");
});

test("outside GameRush share degrades to unsupported", async () => {
  globalThis.location = { protocol: "https:", hostname: "example.com" };
  assert.equal((await sdk.share.share({ text: "x" })).code, "unsupported");
  assert.equal(await sdk.share.isAvailable(), false);
});
