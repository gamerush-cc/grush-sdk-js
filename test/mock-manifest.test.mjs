import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { parseLeaderboardManifest } from "../src/mock-manifest.js";
import { createGRush } from "../src/sdk.js";

const HIGH_SCORE = {
  key: "high_score",
  title: "ハイスコア",
  sort: "desc",
  valueType: "int",
  aggregation: "best",
  period: "all_time",
  minValue: 0,
  maxValue: 1000,
};

let sdk;
let warnings;
const originalWarn = console.warn;

beforeEach(() => {
  globalThis.location = { protocol: "http:", hostname: "localhost" };
  warnings = [];
  console.warn = (message) => warnings.push(message);
  sdk = createGRush();
});

afterEach(() => {
  delete globalThis.location;
  delete globalThis.fetch;
  console.warn = originalWarn;
});

function serve(files) {
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const body = files[new URL(url).pathname];
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(body, { headers: { "content-type": "application/json" } });
  };
  return requested;
}

test("the manifest parser follows the upload rules", () => {
  const parsed = parseLeaderboardManifest(
    `\uFEFF${JSON.stringify({ leaderboards: [HIGH_SCORE] })}`,
  );
  assert.deepEqual(parsed, { ok: true, leaderboards: [{ ...HIGH_SCORE, enabled: true }] });
  assert.deepEqual(parseLeaderboardManifest({ $schema: "x" }), { ok: true, leaderboards: [] });

  const error = (source) => parseLeaderboardManifest(source).error;
  assert.equal(error("not json"), "grush.json can't be read as a JSON object.");
  assert.equal(error("[]"), "grush.json can't be read as a JSON object.");
  assert.equal(error({ boards: [] }), "grush.json has an unknown field: boards");
  assert.equal(
    error({ leaderboards: [{ ...HIGH_SCORE, minvalue: 0 }] }),
    "grush.json has an unknown field: leaderboards[0].minvalue",
  );
  assert.equal(
    error({ leaderboards: [HIGH_SCORE, HIGH_SCORE] }),
    "grush.json declares the leaderboard key more than once: high_score",
  );
  const many = Array.from({ length: 21 }, (_, index) => ({ ...HIGH_SCORE, key: `b${index}` }));
  assert.equal(error({ leaderboards: many }), "grush.json can declare up to 20 leaderboards.");
  assert.equal(error("x".repeat(64 * 1024 + 1)), "grush.json is too large (64KB at most).");

  const invalid = (patch) => error({ leaderboards: [{ ...HIGH_SCORE, ...patch }] });
  assert.equal(invalid({ key: "a b" }), "grush.json has an invalid value: leaderboards[0].key");
  assert.equal(
    invalid({ title: " \n " }),
    "grush.json has an invalid value: leaderboards[0].title",
  );
  assert.equal(
    invalid({ sort: undefined }),
    "grush.json has an invalid value: leaderboards[0].sort",
  );
  assert.equal(
    invalid({ period: "yearly" }),
    "grush.json has an invalid value: leaderboards[0].period",
  );
  assert.equal(
    invalid({ enabled: "no" }),
    "grush.json has an invalid value: leaderboards[0].enabled",
  );
  assert.equal(
    invalid({ minValue: "0" }),
    "grush.json has an invalid value: leaderboards[0].minValue",
  );
  assert.equal(
    invalid({ maxValue: undefined }),
    "grush.json has an invalid value: leaderboards[0].minValue / maxValue",
  );
  assert.equal(
    invalid({ minValue: 5, maxValue: 5 }),
    "grush.json has an invalid value: leaderboards[0].minValue / maxValue",
  );
  assert.equal(
    parseLeaderboardManifest({ leaderboards: [{ ...HIGH_SCORE, title: "a\nb" }] }).leaderboards[0]
      .title,
    "a b",
  );
});

test("loadLeaderboards declares the boards and reports mistakes as invalidParams", async () => {
  const loaded = sdk.mock.loadLeaderboards(JSON.stringify({ leaderboards: [HIGH_SCORE] }));
  assert.deepEqual(loaded, { ok: true, value: ["high_score"], code: "", message: "" });
  assert.equal((await sdk.leaderboards.submit("high_score", 1001)).code, "invalidParams");
  assert.equal((await sdk.leaderboards.submit("high_score", 10)).value.rank, 1);
  const [board] = (await sdk.leaderboards.list()).value;
  assert.equal(board.title, "ハイスコア");

  const failed = sdk.mock.loadLeaderboards({ leaderboards: [{ key: "x" }] });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "invalidParams");
  assert.equal(failed.message, "grush.json has an invalid value: leaderboards[0].title");
});

test("disabled boards and boards without a range behave like GameRush", async () => {
  sdk.mock.loadLeaderboards({
    leaderboards: [
      { ...HIGH_SCORE, key: "off", enabled: false },
      { ...HIGH_SCORE, key: "open", minValue: null, maxValue: null },
    ],
  });
  assert.deepEqual(
    (await sdk.leaderboards.list()).value.map((board) => board.key),
    ["open"],
  );
  const disabled = await sdk.leaderboards.submit("off", 1);
  assert.equal(disabled.code, "invalidParams");
  assert.equal(disabled.message, "The mock leaderboard off is disabled.");
  assert.equal((await sdk.leaderboards.top("off")).code, "invalidParams");
  assert.equal((await sdk.leaderboards.submit("open", 1)).code, "invalidParams");

  // defineLeaderboard keeps accepting any value when no range is given.
  sdk.mock.defineLeaderboard("free");
  assert.equal((await sdk.leaderboards.submit("free", 123456789)).ok, true);
});

test("period boards report the period key and start over when it changes", async () => {
  sdk.mock.loadLeaderboards({
    leaderboards: [
      { ...HIGH_SCORE, key: "daily", period: "daily" },
      { ...HIGH_SCORE, key: "weekly", period: "weekly" },
    ],
  });
  await sdk.leaderboards.submit("daily", 10);
  const today = new Date().toISOString().slice(0, 10);
  const page = await sdk.leaderboards.top("daily");
  assert.equal(page.value.period, "daily");
  assert.equal(page.value.periodKey, today);
  assert.equal(page.value.total, 1);
  assert.match((await sdk.leaderboards.top("weekly")).value.periodKey, /^\d{4}-W\d{2}$/);
});

test("the mock reads grush.json next to the page before the first leaderboard call", async () => {
  globalThis.location = {
    protocol: "http:",
    hostname: "localhost",
    href: "http://localhost:8080/game/index.html",
  };
  const requested = serve({ "/game/grush.json": JSON.stringify({ leaderboards: [HIGH_SCORE] }) });
  sdk.mock.defineLeaderboard("high_score", { title: "Mine" });
  sdk.mock.defineLeaderboard("extra");

  const keys = (await sdk.leaderboards.list()).value.map((board) => [board.key, board.title]);
  assert.deepEqual(keys, [
    ["high_score", "Mine"],
    ["extra", "extra"],
  ]);
  await sdk.leaderboards.list();
  assert.deepEqual(requested, ["http://localhost:8080/game/grush.json"]);
  assert.deepEqual(warnings, []);
});

test("a missing or broken grush.json does not stop the mock", async () => {
  globalThis.location = { protocol: "http:", hostname: "localhost", href: "http://localhost/" };
  serve({});
  sdk.mock.defineLeaderboard("score");
  assert.deepEqual(
    (await sdk.leaderboards.list()).value.map((board) => board.key),
    ["score"],
  );
  assert.deepEqual(warnings, []);

  sdk.mock.reset();
  serve({ "/grush.json": JSON.stringify({ leaderboards: [{ ...HIGH_SCORE, sort: "up" }] }) });
  assert.deepEqual((await sdk.leaderboards.list()).value, []);
  assert.deepEqual(warnings, [
    "[GRush mock] grush.json has an invalid value: leaderboards[0].sort",
  ]);

  sdk.mock.reset();
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  assert.deepEqual((await sdk.leaderboards.list()).value, []);
});

test("file:// pages and an explicit loadLeaderboards skip the automatic read", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("{}");
  };
  globalThis.location = { protocol: "file:", hostname: "", href: "file:///game/index.html" };
  await sdk.leaderboards.list();
  assert.equal(calls, 0);

  globalThis.location = { protocol: "http:", hostname: "localhost", href: "http://localhost/" };
  const local = createGRush();
  local.mock.loadLeaderboards({ leaderboards: [] });
  await local.leaderboards.list();
  assert.equal(calls, 0);
});
