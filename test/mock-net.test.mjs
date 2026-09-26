import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { createGRush } from "../src/sdk.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

let sdk;

beforeEach(() => {
  globalThis.location = { protocol: "http:", hostname: "localhost" };
  sdk = createGRush();
});

afterEach(() => {
  delete globalThis.location;
});

test("the mock room relays messages to and from a mock peer", async () => {
  sdk.mock.reset();
  const bot = sdk.mock.addPeer("Bot");
  const heard = [];
  bot.on("message", (message) => {
    heard.push(message.json());
    bot.send(JSON.stringify({ reply: message.json().n }));
  });

  const joined = await sdk.net.join({ mode: "duel" });
  assert.equal(joined.ok, true);
  const room = joined.value;
  assert.equal(sdk.net.room, room);
  assert.deepEqual(
    room.peers.map((peer) => peer.index),
    [0, 1],
  );
  assert.equal(room.hostPeerId, 0);
  assert.equal(room.isHost(), false);

  const received = [];
  room.on("message", (message) => received.push([message.from, message.json(), message.isStale]));
  assert.equal(room.sendJson({ n: 1 }).ok, true);
  await flush();
  assert.deepEqual(heard, [{ n: 1 }]);
  assert.deepEqual(received, [[0, { reply: 1 }, false]]);
  assert.equal(room.lastSeqFrom(0), 1);

  const events = [];
  room.on("peerleave", (event) => events.push(["leave", event.index]));
  room.on("host", (event) => events.push(["host", event.index]));
  sdk.mock.removePeer(bot);
  await flush();
  assert.deepEqual(events, [
    ["leave", 0],
    ["host", 1],
  ]);
  assert.equal(room.isHost(), true);

  assert.equal((await room.leave()).ok, true);
  assert.equal(room.isClosed, true);
  assert.equal(sdk.net.room, null);
  assert.equal(room.send("late").code, "unavailable");
});

test("unreliable messages can be dropped and oversized ones are refused", async () => {
  sdk.mock.reset();
  const bot = sdk.mock.addPeer("Bot");
  const heard = [];
  bot.on("message", (message) => heard.push(message.channel));
  const room = (await sdk.net.join()).value;

  sdk.mock.config.unreliableDropRate = 1;
  room.send("a", { channel: sdk.CHANNEL_UNRELIABLE });
  room.send("b", { channel: sdk.CHANNEL_RELIABLE });
  await flush();
  assert.deepEqual(heard, ["reliable"]);

  assert.equal(room.send(new Uint8Array(sdk.MAX_MESSAGE_BYTES + 1)).code, "invalidParams");
  assert.equal(room.send({ not: "bytes" }).code, "invalidParams");
});

test("joining again closes the previous room with reason replaced", async () => {
  sdk.mock.reset();
  const first = (await sdk.net.join()).value;
  const reasons = [];
  first.on("close", (event) => reasons.push(event.reason));
  const second = (await sdk.net.join()).value;
  assert.deepEqual(reasons, ["replaced"]);
  assert.equal(first.isClosed, true);
  assert.equal(sdk.net.room, second);
});

test("a peer that reuses a freed index is not treated as stale", async () => {
  sdk.mock.reset();
  const room = (await sdk.net.join()).value;
  const first = sdk.mock.addPeer("First");
  const seen = [];
  room.on("message", (message) => seen.push([message.text(), message.isStale]));
  first.send("a");
  first.send("b");
  await flush();
  sdk.mock.removePeer(first);
  await flush();
  const second = sdk.mock.addPeer("Second");
  assert.equal(second.index, first.index);
  await flush();
  assert.equal(room.lastSeqFrom(second.index), 0);
  second.send("c");
  await flush();
  assert.deepEqual(seen, [
    ["a", false],
    ["b", false],
    ["c", false],
  ]);
});

test("mock rooms follow the server's room code rules", async () => {
  sdk.mock.reset();
  assert.equal((await sdk.net.join({ roomCode: "abcd" })).value.roomCode, "ABCD");
  assert.equal((await sdk.net.join({ roomCode: "WXYZ" })).value.roomCode, "WXYZ");
  assert.equal((await sdk.net.join({ roomCode: "my room" })).code, "internal");
  assert.equal((await sdk.net.join({ mode: "bad mode" })).code, "internal");
});

test("switching backends leaves the current room instead of abandoning it", async () => {
  sdk.mock.reset();
  const room = (await sdk.net.join()).value;
  const reasons = [];
  room.on("close", (event) => reasons.push(event.reason));
  sdk.configure({ backend: "none" });
  await flush();
  assert.deepEqual(reasons, ["left"]);
  assert.equal(sdk.net.room, null);
});

test("removing a stale peer handle does not evict the peer that reused its index", async () => {
  sdk.mock.reset();
  const room = (await sdk.net.join()).value;
  const first = sdk.mock.addPeer("First");
  sdk.mock.removePeer(first);
  const second = sdk.mock.addPeer("Second");
  sdk.mock.removePeer(first);
  await flush();
  assert.ok(room.peers.some((peer) => peer.index === second.index));
  const heard = [];
  second.on("message", (message) => heard.push(message.isStale));
  room.send("hi");
  await flush();
  assert.deepEqual(heard, [false]);
  sdk.mock.definePlayerState("gone", { a: 1 }, { hidden: true });
  assert.equal((await sdk.playerState.report("gone")).code, "invalidParams");
});
