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

test("share passes launchParams through to the runtime at protocol 9", async () => {
  installRuntime(recordingShare(), 9);
  const shared = await sdk.share.share({
    text: "clear",
    launchParams: { stage: "3", item: "sword" },
  });
  assert.equal(shared.value.status, "opened");
  assert.deepEqual(calls.at(-1), { text: "clear", launchParams: { stage: "3", item: "sword" } });
});

test("share leaves out empty launchParams so older runtimes still share", async () => {
  installRuntime(recordingShare(), 3);
  assert.equal((await sdk.share.share({ text: "clear", launchParams: {} })).value.status, "opened");
  assert.deepEqual(calls.at(-1), { text: "clear" });
  assert.equal((await sdk.share.share({ text: "clear", launchParams: null })).ok, true);
  assert.deepEqual(calls.at(-1), { text: "clear" });
});

test("share with launchParams is unsupported below protocol 9 and does not open", async () => {
  installRuntime(recordingShare(), 8);
  const shared = await sdk.share.share({ text: "clear", launchParams: { stage: "3" } });
  assert.equal(shared.ok, false);
  assert.equal(shared.code, "unsupported");
  assert.equal(calls.length, 0);
  assert.equal((await sdk.share.share({ text: "clear" })).ok, true);
});

test("share passes malformed launchParams on so GameRush answers invalidParams", async () => {
  installRuntime(
    {
      share: (options) => {
        calls.push(options);
        return rejection("invalidParams", "Invalid launch params.");
      },
      isAvailable: () => Promise.resolve(true),
    },
    9,
  );
  const shared = await sdk.share.share({ launchParams: { "bad key": "x" } });
  assert.equal(shared.code, "invalidParams");
  assert.deepEqual(calls.at(-1), { launchParams: { "bad key": "x" } });
  assert.equal((await sdk.share.share({ launchParams: "stage=3" })).code, "invalidParams");
  // Values with no own keys of a plain object are still passed on, not taken as "no launch params".
  const map = new Map([["stage", "3"]]);
  assert.equal((await sdk.share.share({ launchParams: map })).code, "invalidParams");
  assert.equal(calls.at(-1).launchParams, map);
  const inherited = Object.create({ stage: "3" });
  assert.equal((await sdk.share.share({ launchParams: inherited })).code, "invalidParams");
  assert.equal(calls.at(-1).launchParams, inherited);
});

test("share with a Map or inherited launchParams is unsupported below protocol 9", async () => {
  installRuntime(recordingShare(), 8);
  const map = new Map([["stage", "3"]]);
  assert.equal((await sdk.share.share({ launchParams: map })).code, "unsupported");
  const inherited = Object.create({ stage: "3" });
  assert.equal((await sdk.share.share({ launchParams: inherited })).code, "unsupported");
  assert.equal(calls.length, 0);
  assert.equal((await sdk.share.share({ launchParams: Object.create(null) })).ok, true);
  assert.deepEqual(calls.at(-1), {});
});

test("share maps a runtime that does not know launchParams to unsupported", async () => {
  installRuntime(
    {
      share: () => rejection("unsupportedMethod", "old host"),
      isAvailable: () => Promise.resolve(true),
    },
    9,
  );
  assert.equal((await sdk.share.share({ launchParams: { stage: "3" } })).code, "unsupported");
});

test("the mock checks launchParams like GameRush", async () => {
  globalThis.location = { protocol: "http:", hostname: "localhost" };
  const valid = {
    a: "",
    "b-1_X": "A.b_c~d:e,f-0",
    c: "x".repeat(128),
    d: "1",
    e: "2",
    f: "3",
    g: "4",
    h: "5",
  };
  assert.equal((await sdk.share.share({ text: "x", launchParams: valid })).value.status, "opened");
  assert.equal((await sdk.share.share({ launchParams: {} })).ok, true);
  const invalid = [
    { "bad key": "x" },
    { ["k".repeat(33)]: "x" },
    { "": "x" },
    { stage: "a b" },
    { stage: "x".repeat(129) },
    { stage: "ステージ" },
    { stage: 3 },
    { stage: null },
    { ...valid, i: "6" },
    JSON.parse('{"__proto__":"x"}'),
    ["3"],
    "stage=3",
    new Map([["stage", "3"]]),
    Object.create({ stage: "3" }),
  ];
  for (const launchParams of invalid) {
    const shared = await sdk.share.share({ launchParams });
    assert.equal(shared.code, "invalidParams", JSON.stringify(launchParams));
  }
  sdk.mock.config.shareAvailable = false;
  assert.equal((await sdk.share.share({ launchParams: { stage: "a b" } })).code, "invalidParams");
  assert.equal((await sdk.share.share({ launchParams: { stage: "3" } })).code, "unavailable");
});
