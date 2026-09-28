/*! GameRush SDK for JavaScript v0.2.0 */
"use strict";
(() => {
  // src/mock-leaderboards.js
  function clamp(value, fallback, max) {
    return typeof value === "number" && value > 0 ? Math.min(Math.floor(value), max) : fallback;
  }
  function createMockLeaderboards(selfIdentity) {
    const boards = /* @__PURE__ */ new Map();
    let rivalCount = 0;
    function define(key, options = {}) {
      boards.set(key, {
        key,
        title: options.title || key,
        sort: options.sort === "asc" ? "asc" : "desc",
        valueType: options.valueType ?? "int",
        aggregation: options.aggregation ?? "best",
        period: "all_time",
        minValue: options.minValue ?? null,
        maxValue: options.maxValue ?? null,
        entries: []
      });
    }
    function ensure(key) {
      if (!boards.has(key)) define(key);
      return boards.get(key);
    }
    function addRival(key, displayName, value, options = {}) {
      const isGuest = options.isGuest === true;
      rivalCount += 1;
      ensure(key).entries.push({
        pseudoId: `mock-rival-${rivalCount}`,
        displayName: isGuest ? null : displayName,
        avatarUrl: isGuest ? null : options.avatarUrl ?? null,
        isGuest,
        value,
        metadata: null,
        isSelf: false
      });
    }
    function ranked(board) {
      const direction = board.sort === "asc" ? 1 : -1;
      return [...board.entries].sort((a, b) => (a.value - b.value) * direction);
    }
    function list() {
      return [...boards.values()].map(({ entries: _entries, ...definition }) => definition);
    }
    function unknown(key) {
      return {
        error: `No mock leaderboard named ${key}. Declare it with GRush.mock.defineLeaderboard.`
      };
    }
    function nextValue(board, current, value) {
      if (board.aggregation === "sum") return current + value;
      if (board.aggregation === "last") return value;
      const better = board.sort === "asc" ? value < current : value > current;
      return better ? value : current;
    }
    function submit(key, value, metadata) {
      const board = boards.get(key);
      if (!board) return unknown(key);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { error: "Score must be a finite number." };
      }
      if (board.valueType !== "float" && !Number.isInteger(value)) {
        return { error: "Score must be an integer for this leaderboard." };
      }
      if (board.valueType === "duration_ms" && value < 0) {
        return { error: "Duration must not be negative." };
      }
      const belowMin = board.minValue !== null && value < board.minValue;
      const aboveMax = board.maxValue !== null && value > board.maxValue;
      if (belowMin || aboveMax) {
        return { error: "Score is outside the declared range." };
      }
      let self = board.entries.find((entry) => entry.isSelf);
      let updated = true;
      if (!self) {
        self = { isSelf: true, value, metadata: null };
        board.entries.push(self);
      } else {
        const next = nextValue(board, self.value, value);
        updated = next !== self.value;
        self.value = next;
      }
      Object.assign(self, selfIdentity());
      if (metadata !== void 0 && metadata !== null) self.metadata = metadata;
      const rank = ranked(board).indexOf(self) + 1;
      return { result: { accepted: true, updated, value: self.value, rank, verified: false } };
    }
    function pageWire(board, entries, start, total) {
      return {
        key: board.key,
        title: board.title,
        sort: board.sort,
        valueType: board.valueType,
        period: board.period,
        periodKey: "",
        verified: false,
        total,
        entries: entries.map((stored, index) => {
          const entry = stored.isSelf ? { ...stored, ...selfIdentity() } : stored;
          return {
            rank: start + index + 1,
            pseudoId: entry.pseudoId,
            displayName: entry.displayName,
            avatarUrl: entry.avatarUrl,
            isGuest: entry.isGuest,
            value: entry.value,
            metadata: entry.metadata ?? null,
            submittedAt: "",
            isSelf: entry.isSelf
          };
        })
      };
    }
    function page(key, options = {}, aroundMe = false) {
      const board = boards.get(key);
      if (!board) return unknown(key);
      const rows = ranked(board);
      if (!aroundMe) {
        const start2 = Math.max(0, options.offset ?? 0);
        const count = clamp(options.limit, 20, 100);
        return { page: pageWire(board, rows.slice(start2, start2 + count), start2, rows.length) };
      }
      const selfIndex = rows.findIndex((entry) => entry.isSelf);
      if (selfIndex < 0) return { page: pageWire(board, [], 0, rows.length) };
      const range = clamp(options.range, 5, 25);
      const start = Math.max(0, selfIndex - range);
      return {
        page: pageWire(board, rows.slice(start, selfIndex + range + 1), start, rows.length)
      };
    }
    return { define, addRival, list, submit, page, reset: () => boards.clear() };
  }

  // src/bytes.js
  var MAX_MESSAGE_BYTES = 8 * 1024;
  function toBytes(payload) {
    if (payload instanceof ArrayBuffer) return payload.slice(0);
    if (ArrayBuffer.isView(payload)) {
      return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    }
    if (typeof payload === "string") return new TextEncoder().encode(payload).buffer;
    return null;
  }
  function decodeText(buffer) {
    if (!(buffer instanceof ArrayBuffer)) return "";
    return new TextDecoder().decode(buffer);
  }
  function decodeJson(buffer) {
    try {
      return JSON.parse(decodeText(buffer));
    } catch {
      return void 0;
    }
  }

  // src/mock-net.js
  var MODE_PATTERN = /^[A-Za-z0-9._:-]{1,32}$/;
  var ROOM_CODE_PATTERN = /^[A-Za-z0-9]{4,12}$/;
  function later(callback) {
    setTimeout(callback, 0);
  }
  function createListeners() {
    const handlers = /* @__PURE__ */ new Map();
    return {
      on(name, handler) {
        if (typeof handler !== "function") return () => {
        };
        const list = handlers.get(name) ?? [];
        handlers.set(name, [...list, handler]);
        return () => handlers.set(
          name,
          (handlers.get(name) ?? []).filter((h) => h !== handler)
        );
      },
      emit(name, event) {
        for (const handler of handlers.get(name) ?? []) {
          try {
            handler(event);
          } catch {
          }
        }
      },
      clear: () => handlers.clear()
    };
  }
  function createMockNet(config, localPeerWire) {
    const members = /* @__PURE__ */ new Map();
    const outgoingSeq = /* @__PURE__ */ new Map();
    const local = createListeners();
    let localIndex = -1;
    let roomCode = "";
    let hostIndex = -1;
    let peerSerial = 0;
    function nextFreeIndex() {
      for (let index = 0; index < config.maxPeers; index += 1) {
        if (!members.has(index) && index !== localIndex) return index;
      }
      return -1;
    }
    function peerWire(index) {
      const peer = members.get(index);
      if (!peer) return localPeerWire(index);
      return {
        index,
        pseudoId: peer.pseudoId,
        displayName: peer.displayName,
        avatarUrl: peer.avatarUrl
      };
    }
    function lowestIndex() {
      return members.size === 0 && localIndex < 0 ? -1 : Math.min(...allIndexes());
    }
    function allIndexes() {
      const indexes = [...members.keys()];
      if (localIndex >= 0) indexes.push(localIndex);
      return indexes;
    }
    function announceToLocal(name, event) {
      if (localIndex < 0) return;
      later(() => local.emit(name, event));
    }
    function refreshHost() {
      const next = lowestIndex();
      if (next === hostIndex) return;
      hostIndex = next;
      if (next >= 0) announceToLocal("host", { index: next });
    }
    function route(from, payload, options = {}) {
      const bytes = toBytes(payload);
      if (!bytes) throw new TypeError("Payload must be an ArrayBuffer, a typed array, or a string.");
      const channel = options.channel === "unreliable" ? "unreliable" : "reliable";
      const to = typeof options.to === "number" ? options.to : -1;
      if (channel === "unreliable" && Math.random() < config.unreliableDropRate) return;
      const seq = (outgoingSeq.get(from) ?? 0) + 1;
      outgoingSeq.set(from, seq);
      for (const index of allIndexes()) {
        if (index === from || to !== -1 && index !== to) continue;
        const message = { from, channel, seq, payload: bytes.slice(0) };
        const peer = members.get(index);
        if (peer) later(() => peer.listeners.emit("message", withDecoders(message)));
        else later(() => local.emit("message", message));
      }
    }
    function addPeer(displayName, avatarUrl = null) {
      const index = nextFreeIndex();
      if (index < 0) return null;
      const listeners = createListeners();
      peerSerial += 1;
      const peer = {
        index,
        pseudoId: `mock-peer-${peerSerial}`,
        displayName,
        avatarUrl,
        listeners
      };
      members.set(index, peer);
      announceToLocal("peerjoin", peerWire(index));
      refreshHost();
      return {
        index,
        pseudoId: peer.pseudoId,
        displayName,
        avatarUrl,
        on: (name, handler) => listeners.on(name, handler),
        send: (payload, options) => {
          if (members.get(index) === peer) route(index, payload, options);
        }
      };
    }
    function removePeer(handle) {
      if (!handle || members.get(handle.index)?.pseudoId !== handle.pseudoId) return;
      members.get(handle.index).listeners.clear();
      members.delete(handle.index);
      outgoingSeq.delete(handle.index);
      announceToLocal("peerleave", { index: handle.index });
      refreshHost();
    }
    function leave() {
      if (localIndex < 0) return;
      outgoingSeq.delete(localIndex);
      localIndex = -1;
      local.clear();
      hostIndex = lowestIndex();
    }
    function join(params) {
      leave();
      const mode = params.mode ?? "default";
      const requested = params.roomCode;
      if (!MODE_PATTERN.test(mode)) return null;
      if (requested !== void 0 && !ROOM_CODE_PATTERN.test(requested)) return null;
      const index = nextFreeIndex();
      if (index < 0) return null;
      roomCode = requested ? requested.toUpperCase() : roomCode || "MOCKROOM";
      const peers = [...members.keys()].map(peerWire);
      localIndex = index;
      hostIndex = lowestIndex();
      const source = {
        on: (name, handler) => local.on(name, handler),
        send: (bytes, options) => route(index, bytes, options),
        leave: async () => {
          if (localIndex === index) leave();
          return true;
        }
      };
      const info = {
        roomId: `mock:${mode}:${roomCode}`,
        roomCode,
        epoch: 1,
        localPeerIndex: index,
        hostIndex,
        peers: [...peers, localPeerWire(index)],
        transport: "ws",
        serverTimeMs: Date.now()
      };
      return { source, info };
    }
    function reset() {
      for (const peer of members.values()) peer.listeners.clear();
      members.clear();
      outgoingSeq.clear();
      leave();
      roomCode = "";
      hostIndex = -1;
    }
    return { join, addPeer, removePeer, reset };
  }
  function withDecoders(message) {
    return {
      ...message,
      isStale: false,
      text: () => decodeText(message.payload),
      json: () => decodeJson(message.payload)
    };
  }

  // src/result.js
  var CODES = Object.freeze({
    unsupported: "unsupported",
    unavailable: "unavailable",
    timeout: "timeout",
    rateLimited: "rateLimited",
    signInRequired: "signInRequired",
    consentDeclined: "consentDeclined",
    invalidParams: "invalidParams",
    conflict: "conflict",
    internal: "internal"
  });
  var PASS_THROUGH_CODES = new Set(Object.values(CODES));
  function ok(value) {
    return { ok: true, value, code: "", message: "" };
  }
  function failure(code, message) {
    return { ok: false, value: null, code, message };
  }
  function unsupported() {
    return failure(CODES.unsupported, "GameRush GameAPI is not available here.");
  }
  function failureFromError(error) {
    const rawCode = error && typeof error.code === "string" ? error.code : "";
    const code = rawCode === "unsupportedMethod" ? CODES.unsupported : PASS_THROUGH_CODES.has(rawCode) ? rawCode : CODES.internal;
    const result = failure(code, messageOf(error, "GameRush API call failed."));
    if (error && typeof error.retryAfterMs === "number") result.retryAfterMs = error.retryAfterMs;
    return result;
  }
  var CLOUD_SAVE_STATUS_CODES = /* @__PURE__ */ new Map([
    [0, CODES.unavailable],
    [400, CODES.invalidParams],
    [401, CODES.signInRequired],
    [409, CODES.conflict],
    [413, CODES.invalidParams],
    [429, CODES.rateLimited]
  ]);
  function failureFromCloudSaveError(error) {
    const status = error && typeof error.status === "number" ? error.status : null;
    const message = messageOf(error, "Cloud save failed.");
    if (status === null) {
      if (/timed out/i.test(message)) return failure(CODES.timeout, message);
      if (/only available inside GameRush|frame was destroyed/i.test(message)) {
        return failure(CODES.unavailable, message);
      }
      return failure(CODES.invalidParams, message);
    }
    if (status === 409 && /owner mismatch/i.test(message)) return failure(CODES.internal, message);
    return failure(CLOUD_SAVE_STATUS_CODES.get(status) ?? CODES.internal, message);
  }
  function messageOf(error, fallback) {
    return error && typeof error.message === "string" && error.message ? error.message : fallback;
  }

  // src/backend-mock.js
  var STORAGE_KEY = "grush-sdk-mock";
  var SLOT_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
  var PLAYER_STATE_MAX_BYTES = 4 * 1024;
  var CLOUD_SAVE_MAX_BYTES = 256 * 1024;
  var OPAQUE_STRING_MIN_LENGTH = 256;
  var BASE64_LIKE = /^[A-Za-z0-9+/\-_]+={0,2}$/;
  function containsOpaqueString(value) {
    if (typeof value === "string") {
      return value.length >= OPAQUE_STRING_MIN_LENGTH && BASE64_LIKE.test(value);
    }
    if (Array.isArray(value)) return value.some(containsOpaqueString);
    if (value && typeof value === "object") return Object.values(value).some(containsOpaqueString);
    return false;
  }
  function defaultMockConfig() {
    return {
      signedIn: true,
      displayName: "Local Player",
      avatarUrl: null,
      grantProfileConsent: true,
      confirmPlayerStateReport: true,
      unreliableDropRate: 0,
      maxPeers: 8,
      shareAvailable: true,
      shareStatus: "opened"
    };
  }
  var memoryStore = null;
  function readStored() {
    if (memoryStore) return memoryStore;
    try {
      const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "{}");
      memoryStore = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      memoryStore = {};
    }
    return memoryStore;
  }
  function writeStored(patch) {
    memoryStore = { ...readStored(), ...patch };
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(memoryStore));
    } catch {
    }
  }
  function localPseudoId() {
    const stored = readStored().pseudoId;
    if (typeof stored === "string" && stored) return stored;
    const created = `mock-local-${Math.random().toString(36).slice(2, 12)}`;
    writeStored({ pseudoId: created });
    return created;
  }
  function jsonBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  }
  function snapshot(result) {
    if (!result.ok || !result.value || typeof result.value !== "object" || result.value.source) {
      return result;
    }
    return { ...result, value: structuredClone(result.value) };
  }
  function invalid(message) {
    return failure(CODES.invalidParams, message);
  }
  function createMockBackend(config) {
    const otherStates = /* @__PURE__ */ new Map();
    const cloudSaves = /* @__PURE__ */ new Map();
    let myState = null;
    const consented = () => config.signedIn && readStored().consent === true;
    function playerWire() {
      return {
        pseudoId: localPseudoId(),
        isGuest: !config.signedIn,
        profileConsent: consented(),
        profile: { displayName: config.displayName, avatarUrl: config.avatarUrl }
      };
    }
    function localPeerWire(index) {
      return {
        index,
        pseudoId: localPseudoId(),
        displayName: consented() ? config.displayName : null,
        avatarUrl: consented() ? config.avatarUrl : null
      };
    }
    const net = createMockNet(config, localPeerWire);
    const leaderboards = createMockLeaderboards(() => {
      const { index: _index, ...identity } = localPeerWire(-1);
      return { ...identity, isGuest: !config.signedIn };
    });
    function requestProfile() {
      if (!config.signedIn) {
        return failure(CODES.signInRequired, "The player is a guest and has no profile.");
      }
      if (!config.grantProfileConsent) {
        return failure(CODES.consentDeclined, "The player declined to share their profile.");
      }
      writeStored({ consent: true });
      return ok(playerWire());
    }
    function setMine({ payload, baseRevision }) {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return invalid("Player state payload must be a JSON object.");
      }
      if (jsonBytes(payload) > PLAYER_STATE_MAX_BYTES) return invalid("Player state is too large.");
      if (containsOpaqueString(payload)) {
        return invalid("Player state must not contain opaque encoded strings.");
      }
      const current = myState ? myState.revision : 0;
      if (typeof baseRevision === "number" && baseRevision !== current) {
        return failure(CODES.invalidParams, "Player state was updated elsewhere.");
      }
      myState = {
        pseudoId: localPseudoId(),
        payload: structuredClone(payload),
        revision: current + 1,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      return ok(myState);
    }
    function getMany({ pseudoIds }) {
      if (!Array.isArray(pseudoIds) || pseudoIds.length === 0 || pseudoIds.length > 50) {
        return invalid("pseudoIds must be an array of at most 50 ids.");
      }
      const states = pseudoIds.map((id) => otherStates.get(id)).filter((state) => state && !state.hidden).map(({ hidden: _hidden, ...state }) => state);
      return ok(states);
    }
    function saveCloud({ payload, slot, baseRevision }) {
      const key = slot || "default";
      if (!SLOT_PATTERN.test(key)) return invalid("Invalid cloud save slot.");
      if (payload === void 0 || payload === null)
        return invalid("Cloud save payload is required.");
      if (jsonBytes(payload) > CLOUD_SAVE_MAX_BYTES)
        return invalid("Cloud save payload is too large.");
      if (!config.signedIn) return failure(CODES.signInRequired, "Cloud save requires sign-in.");
      const current = cloudSaves.get(key);
      const revision = current ? current.revision : 0;
      if (typeof baseRevision === "number" && baseRevision !== revision) {
        return failure(CODES.conflict, "Cloud save was updated elsewhere.");
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const save = {
        slot: key,
        payload: structuredClone(payload),
        revision: revision + 1,
        createdAt: current ? current.createdAt : now,
        updatedAt: now
      };
      cloudSaves.set(key, save);
      return ok(save);
    }
    function cloudGuard(slot) {
      if (!SLOT_PATTERN.test(slot || "default")) return invalid("Invalid cloud save slot.");
      if (!config.signedIn) return failure(CODES.signInRequired, "Cloud save requires sign-in.");
      return null;
    }
    function fromBoard(outcome, pick) {
      return outcome.error ? invalid(outcome.error) : ok(pick(outcome));
    }
    const handlers = {
      "player.getSelf": () => ok(playerWire()),
      "player.requestProfile": requestProfile,
      "player.revokeProfile": () => {
        writeStored({ consent: false });
        return ok(playerWire());
      },
      "leaderboard.list": () => ok(leaderboards.list()),
      "leaderboard.submit": (p) => fromBoard(leaderboards.submit(p.key, p.value, p.metadata), (o) => o.result),
      "leaderboard.top": (p) => fromBoard(leaderboards.page(p.key, p, false), (o) => o.page),
      "leaderboard.aroundMe": (p) => fromBoard(leaderboards.page(p.key, p, true), (o) => o.page),
      "leaderboard.friends": () => failure(CODES.consentDeclined, "Friend leaderboards require per-game friend consent."),
      "playerState.getMine": () => ok(myState),
      "playerState.setMine": setMine,
      "playerState.get": getMany,
      "playerState.report": (p) => {
        if (!config.signedIn) return failure(CODES.signInRequired, "Reporting requires sign-in.");
        const target = otherStates.get(p.pseudoId);
        if (!target || target.hidden) return invalid("No player state for that id.");
        return ok(config.confirmPlayerStateReport === true);
      },
      "cloudSave.load": (p) => cloudGuard(p.slot) ?? ok(cloudSaves.get(p.slot || "default") ?? null),
      "cloudSave.save": saveCloud,
      "cloudSave.remove": (p) => cloudGuard(p.slot) ?? ok(cloudSaves.delete(p.slot || "default")),
      "share.open": () => {
        if (!config.shareAvailable) return failure(CODES.unavailable, "Sharing is unavailable here.");
        return ok({ status: config.shareStatus === "cancelled" ? "cancelled" : "opened" });
      },
      "share.getAvailability": () => ok(config.shareAvailable === true),
      "net.join": (p) => {
        const joined = net.join(p);
        if (joined === null) return failure(CODES.internal, "Failed to join a room.");
        return ok(joined);
      }
    };
    const controls = {
      config,
      defineLeaderboard: (key, options) => leaderboards.define(key, options),
      addRival: (key, displayName, value, options) => leaderboards.addRival(key, displayName, value, options),
      definePlayerState(pseudoId, payload, options = {}) {
        otherStates.set(pseudoId, {
          pseudoId,
          payload: structuredClone(payload),
          revision: 1,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          hidden: options.hidden === true
        });
      },
      addPeer: (displayName, avatarUrl) => net.addPeer(displayName, avatarUrl),
      removePeer: (peer) => net.removePeer(peer),
      reset() {
        leaderboards.reset();
        otherStates.clear();
        cloudSaves.clear();
        myState = null;
        net.reset();
        Object.assign(config, defaultMockConfig());
        writeStored({ consent: false });
      }
    };
    return {
      kind: "mock",
      controls,
      isAvailable: () => true,
      protocolVersion: () => 3,
      async call(method, params = {}) {
        const handler = handlers[method];
        if (!handler) return failure(CODES.unsupported, `The mock does not implement ${method}.`);
        await new Promise((resolve) => setTimeout(resolve, 0));
        try {
          return snapshot(handler(params ?? {}));
        } catch (error) {
          return invalid(error instanceof Error ? error.message : "The mock rejected the call.");
        }
      }
    };
  }

  // src/backend-web.js
  function runtimeApi(name) {
    return globalThis[`GRush${name}`] ?? globalThis[`GameRush${name}`] ?? null;
  }
  function isRuntimePresent() {
    return runtimeApi("Info") !== null && runtimeApi("Player") !== null;
  }
  function describeRoom(room) {
    if (typeof room.describe === "function") return room.describe();
    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      epoch: room.roomEpoch,
      localPeerIndex: room.localPeerId,
      hostIndex: room.hostPeerId,
      peers: room.peers,
      transport: room.stats ? room.stats.transport : "ws",
      serverTimeMs: typeof room.serverTimeMs === "function" ? room.serverTimeMs() : Date.now()
    };
  }
  function roomSourceOf(room) {
    return {
      on: (name, handler) => room.on(name, handler),
      send: (bytes, options) => room.send(bytes, options),
      leave: () => room.leave()
    };
  }
  var INVOKERS = {
    "player.getSelf": (apis) => apis.Player?.getSelf(),
    "player.requestProfile": (apis) => apis.Player?.requestProfile(),
    "player.revokeProfile": (apis) => apis.Player?.revokeProfile(),
    "leaderboard.list": (apis) => apis.Leaderboards?.list(),
    "leaderboard.submit": (apis, p) => apis.Leaderboards?.submit(p.key, p.value, p.metadata, p.operationId),
    "leaderboard.top": (apis, p) => apis.Leaderboards?.top(p.key, p),
    "leaderboard.aroundMe": (apis, p) => apis.Leaderboards?.aroundMe(p.key, p),
    "leaderboard.friends": (apis, p) => apis.Leaderboards?.friends(p.key, p),
    "playerState.getMine": (apis) => apis.PlayerState?.getMine(),
    "playerState.setMine": (apis, p) => apis.PlayerState?.setMine(p.payload, p.baseRevision),
    "playerState.get": (apis, p) => apis.PlayerState?.get(p.pseudoIds),
    "playerState.report": (apis, p) => apis.PlayerState?.report(p.pseudoId),
    "share.open": (apis, p) => apis.Share?.share(p),
    "share.getAvailability": (apis) => apis.Share?.isAvailable(),
    "net.join": (apis, p) => apis.Net?.join(p).then(
      (room) => room ? { source: roomSourceOf(room), info: describeRoom(room) } : null
    )
  };
  var CLOUD_SAVE_INVOKERS = {
    "cloudSave.load": (api, p) => api.loadWithMetadata(p.slot),
    "cloudSave.save": (api, p) => {
      const options = typeof p.baseRevision === "number" ? { baseRevision: p.baseRevision } : {};
      return api.save(p.payload, p.slot, options);
    },
    "cloudSave.remove": (api, p) => api.remove(p.slot)
  };
  function currentApis() {
    return {
      Player: runtimeApi("Player"),
      Leaderboards: runtimeApi("Leaderboards"),
      PlayerState: runtimeApi("PlayerState"),
      Net: runtimeApi("Net"),
      Share: runtimeApi("Share")
    };
  }
  async function callCloudSave(method, params) {
    const api = runtimeApi("CloudSave");
    if (!api) return unsupported();
    try {
      return ok(await CLOUD_SAVE_INVOKERS[method](api, params));
    } catch (error) {
      return failureFromCloudSaveError(error);
    }
  }
  function createWebBackend() {
    return {
      kind: "web",
      isAvailable: () => isRuntimePresent(),
      protocolVersion() {
        const version = runtimeApi("Info")?.protocolVersion;
        return typeof version === "number" ? version : 0;
      },
      async call(method, params = {}) {
        if (method in CLOUD_SAVE_INVOKERS) return callCloudSave(method, params);
        const invoke = INVOKERS[method];
        if (!invoke) return failure("unsupported", `GameRush does not expose ${method}.`);
        try {
          const pending = invoke(currentApis(), params);
          if (pending === void 0) return unsupported();
          return ok(await pending);
        } catch (error) {
          return failureFromError(error);
        }
      }
    };
  }

  // src/normalize.js
  var text = (value, fallback = "") => typeof value === "string" ? value : fallback;
  var number = (value, fallback = 0) => typeof value === "number" ? value : fallback;
  var nullableText = (value) => typeof value === "string" ? value : null;
  function playerOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    const source = raw;
    const consent = source.profileConsent === true;
    const profile = consent && source.profile && typeof source.profile === "object" ? source.profile : {};
    return {
      pseudoId: text(source.pseudoId),
      isGuest: source.isGuest !== false,
      profileConsent: consent,
      displayName: nullableText(profile.displayName),
      avatarUrl: nullableText(profile.avatarUrl)
    };
  }
  function peerOf(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      index: number(source.index, -1),
      pseudoId: text(source.pseudoId),
      displayName: nullableText(source.displayName),
      avatarUrl: nullableText(source.avatarUrl)
    };
  }
  function leaderboardDefinitionOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    const source = raw;
    return {
      key: text(source.key),
      title: text(source.title),
      sort: source.sort === "asc" ? "asc" : "desc",
      valueType: text(source.valueType, "int"),
      aggregation: text(source.aggregation, "best"),
      period: text(source.period, "all_time"),
      minValue: typeof source.minValue === "number" ? source.minValue : null,
      maxValue: typeof source.maxValue === "number" ? source.maxValue : null
    };
  }
  function submitResultOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      accepted: raw.accepted === true,
      updated: raw.updated === true,
      value: number(raw.value),
      rank: typeof raw.rank === "number" ? raw.rank : null,
      verified: false
    };
  }
  function entryOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    const source = raw;
    return {
      rank: number(source.rank),
      pseudoId: text(source.pseudoId),
      displayName: nullableText(source.displayName),
      avatarUrl: nullableText(source.avatarUrl),
      isGuest: source.isGuest !== false,
      value: number(source.value),
      metadata: source.metadata ?? null,
      submittedAt: text(source.submittedAt),
      isSelf: source.isSelf === true
    };
  }
  function leaderboardPageOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      key: text(raw.key),
      title: text(raw.title),
      sort: raw.sort === "asc" ? "asc" : "desc",
      valueType: text(raw.valueType, "int"),
      period: text(raw.period, "all_time"),
      periodKey: text(raw.periodKey),
      verified: false,
      entries: Array.isArray(raw.entries) ? raw.entries.map(entryOf).filter((entry) => entry !== null) : [],
      total: number(raw.total)
    };
  }
  function playerStateOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      pseudoId: text(raw.pseudoId),
      payload: raw.payload ?? {},
      revision: number(raw.revision),
      updatedAt: text(raw.updatedAt)
    };
  }
  function cloudSaveOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      slot: text(raw.slot, "default"),
      payload: raw.payload ?? null,
      revision: number(raw.revision),
      createdAt: text(raw.createdAt),
      updatedAt: text(raw.updatedAt)
    };
  }
  function shareResultOf(raw) {
    if (!raw || typeof raw !== "object") return null;
    return { status: raw.status === "opened" ? "opened" : "cancelled" };
  }

  // src/room.js
  var EVENTS = ["message", "peerjoin", "peerleave", "host", "transportchange", "close"];
  function createRoom(source, info, onClosed) {
    const listeners = new Map(EVENTS.map((name) => [name, []]));
    const lastSeq = /* @__PURE__ */ new Map();
    const serverOffsetMs = (typeof info.serverTimeMs === "number" ? info.serverTimeMs : Date.now()) - Date.now();
    let peers = Array.isArray(info.peers) ? info.peers.map(peerOf) : [];
    let hostPeerId = typeof info.hostIndex === "number" ? info.hostIndex : 0;
    let transport = typeof info.transport === "string" ? info.transport : "ws";
    let closed = false;
    const unsubscribers = [];
    function emit(name, event) {
      for (const handler of listeners.get(name) ?? []) {
        try {
          handler(event);
        } catch {
        }
      }
    }
    function markClosed(reason) {
      if (closed) return;
      closed = true;
      peers = [];
      for (const unsubscribe of unsubscribers.splice(0)) {
        try {
          unsubscribe?.();
        } catch {
        }
      }
      onClosed(room);
      emit("close", { reason });
    }
    const handlers = {
      message(raw) {
        const from = typeof raw?.from === "number" ? raw.from : -1;
        const seq = typeof raw?.seq === "number" ? raw.seq : 0;
        const previous = lastSeq.get(from) ?? 0;
        if (seq > previous) lastSeq.set(from, seq);
        const payload = raw?.payload instanceof ArrayBuffer ? raw.payload : new ArrayBuffer(0);
        emit("message", {
          from,
          channel: raw?.channel === "unreliable" ? "unreliable" : "reliable",
          seq,
          payload,
          isStale: seq !== 0 && seq <= previous,
          text: () => decodeText(payload),
          json: () => decodeJson(payload)
        });
      },
      peerjoin(raw) {
        const peer = peerOf(raw);
        lastSeq.delete(peer.index);
        peers = [...peers.filter((entry) => entry.index !== peer.index), peer];
        emit("peerjoin", peer);
      },
      peerleave(raw) {
        const index = typeof raw?.index === "number" ? raw.index : -1;
        peers = peers.filter((entry) => entry.index !== index);
        lastSeq.delete(index);
        emit("peerleave", { index });
      },
      host(raw) {
        if (typeof raw?.index === "number") hostPeerId = raw.index;
        emit("host", { index: hostPeerId });
      },
      transportchange(raw) {
        if (typeof raw?.transport === "string") transport = raw.transport;
        emit("transportchange", { transport });
      },
      close(raw) {
        markClosed(typeof raw?.reason === "string" ? raw.reason : "");
      }
    };
    const room = {
      roomId: typeof info.roomId === "string" ? info.roomId : "",
      roomCode: typeof info.roomCode === "string" ? info.roomCode : "",
      roomEpoch: typeof info.epoch === "number" ? info.epoch : 0,
      localPeerId: typeof info.localPeerIndex === "number" ? info.localPeerIndex : 0,
      get peers() {
        return peers.slice();
      },
      get hostPeerId() {
        return hostPeerId;
      },
      get transport() {
        return transport;
      },
      get isClosed() {
        return closed;
      },
      isHost: () => hostPeerId === room.localPeerId,
      serverTimeMs: () => Date.now() + serverOffsetMs,
      lastSeqFrom: (peerId) => lastSeq.get(peerId) ?? 0,
      on(name, handler) {
        const list = listeners.get(name);
        if (!list || typeof handler !== "function") return () => {
        };
        list.push(handler);
        return () => {
          const current = listeners.get(name);
          const index = current.indexOf(handler);
          if (index >= 0) current.splice(index, 1);
        };
      },
      send(payload, rawOptions) {
        const options = rawOptions ?? {};
        if (closed) return failure(CODES.unavailable, "The room is already closed.");
        const bytes = toBytes(payload);
        if (!bytes) {
          return failure(
            CODES.invalidParams,
            "Payload must be an ArrayBuffer, a typed array, or a string."
          );
        }
        if (bytes.byteLength > MAX_MESSAGE_BYTES) {
          return failure(CODES.invalidParams, "Payload exceeds the 8KB message limit.");
        }
        const channel = options.channel === "unreliable" ? "unreliable" : "reliable";
        const to = typeof options.to === "number" ? options.to : -1;
        try {
          source.send(bytes, { channel, to });
          return ok(true);
        } catch (error) {
          return failureFromError(error);
        }
      },
      sendJson(value, options) {
        let encoded;
        try {
          encoded = JSON.stringify(value);
        } catch (error) {
          return failure(
            CODES.invalidParams,
            error instanceof Error ? error.message : "Value is not JSON."
          );
        }
        if (typeof encoded !== "string") return failure(CODES.invalidParams, "Value is not JSON.");
        return room.send(encoded, options);
      },
      async leave() {
        if (closed) return ok(true);
        let result = ok(true);
        try {
          await source.leave();
        } catch (error) {
          result = failureFromError(error);
        }
        markClosed("left");
        return result;
      },
      closeLocally: (reason) => markClosed(reason)
    };
    for (const name of EVENTS) {
      unsubscribers.push(source.on(name, (event) => handlers[name](event)));
    }
    return room;
  }

  // src/sdk.js
  var VERSION = "0.2.0";
  var REQUIRED_PROTOCOL_VERSION = 1;
  var PLAYER_STATE_PROTOCOL_VERSION = 2;
  var SHARE_PROTOCOL_VERSION = 3;
  var BACKENDS = /* @__PURE__ */ new Set(["auto", "web", "mock", "none"]);
  var LOCAL_HOSTNAMES = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  var noneBackend = {
    kind: "none",
    isAvailable: () => false,
    protocolVersion: () => 0,
    call: async () => unsupported()
  };
  function isLocalDevelopment() {
    const location = globalThis.location;
    if (!location) return false;
    return location.protocol === "file:" || LOCAL_HOSTNAMES.has(location.hostname);
  }
  function createGRush(options = {}) {
    const mockBackend = createMockBackend(defaultMockConfig());
    const webBackend = createWebBackend();
    let selection = BACKENDS.has(options.backend) ? options.backend : "auto";
    let currentRoom = null;
    function backend() {
      if (selection === "web") return webBackend;
      if (selection === "mock") return mockBackend;
      if (selection === "none") return noneBackend;
      if (isRuntimePresent()) return webBackend;
      return isLocalDevelopment() ? mockBackend : noneBackend;
    }
    function closeCurrentRoom(reason) {
      const previous = currentRoom;
      currentRoom = null;
      previous?.closeLocally(reason);
    }
    async function call(method, params, minProtocol = REQUIRED_PROTOCOL_VERSION) {
      const active = backend();
      if (!active.isAvailable() || active.protocolVersion() < minProtocol) return unsupported();
      return active.call(method, params);
    }
    async function mapped(method, params, pick, minProtocol) {
      const result = await call(method, params, minProtocol);
      if (!result.ok) return result;
      const value = pick(result.value);
      if (value === void 0)
        return failure(CODES.internal, `GameRush returned an unreadable ${method} result.`);
      return ok(value);
    }
    const orNull = (normalize) => (raw) => raw == null ? null : normalize(raw);
    const required = (normalize) => (raw) => normalize(raw) ?? void 0;
    const listOf = (normalize) => (raw) => Array.isArray(raw) ? raw.map(normalize).filter((item) => item !== null) : [];
    const playerCall = (method) => () => mapped(method, void 0, required(playerOf));
    const statesCall = (method, params, pick) => mapped(method, params, pick, PLAYER_STATE_PROTOCOL_VERSION);
    const player = {
      getSelf: playerCall("player.getSelf"),
      requestProfile: playerCall("player.requestProfile"),
      revokeProfile: playerCall("player.revokeProfile")
    };
    const leaderboards = {
      list: () => mapped("leaderboard.list", void 0, listOf(leaderboardDefinitionOf)),
      submit(key, value, rawExtra) {
        const extra = rawExtra ?? {};
        const params = { key, value };
        if (extra.metadata !== void 0) params.metadata = extra.metadata;
        if (typeof extra.operationId === "string") params.operationId = extra.operationId;
        return mapped("leaderboard.submit", params, required(submitResultOf));
      },
      top: (key, opts) => mapped(
        "leaderboard.top",
        pageParams(key, opts, ["limit", "offset"]),
        required(leaderboardPageOf)
      ),
      aroundMe: (key, opts) => mapped("leaderboard.aroundMe", pageParams(key, opts, ["range"]), required(leaderboardPageOf)),
      friends: (key, opts) => mapped("leaderboard.friends", pageParams(key, opts, ["limit"]), required(leaderboardPageOf))
    };
    const playerState = {
      getMine: () => statesCall("playerState.getMine", void 0, orNull(playerStateOf)),
      setMine(payload, baseRevision) {
        const params = { payload };
        if (typeof baseRevision === "number") params.baseRevision = baseRevision;
        return statesCall("playerState.setMine", params, required(playerStateOf));
      },
      get: (pseudoIds) => statesCall("playerState.get", { pseudoIds }, listOf(playerStateOf)),
      report: (pseudoId) => statesCall("playerState.report", { pseudoId }, (raw) => raw === true)
    };
    const cloudSave = {
      load: (slot) => mapped("cloudSave.load", { slot }, orNull(cloudSaveOf), 0),
      save(payload, slot, rawExtra) {
        const extra = rawExtra ?? {};
        const params = { payload, slot };
        if (typeof extra.baseRevision === "number") params.baseRevision = extra.baseRevision;
        return mapped("cloudSave.save", params, required(cloudSaveOf), 0);
      },
      remove: (slot) => mapped("cloudSave.remove", { slot }, () => true, 0)
    };
    const share = {
      share(rawOptions) {
        const opts = rawOptions ?? {};
        const params = {};
        if (opts.text !== void 0) params.text = opts.text;
        if (opts.image !== void 0) params.image = opts.image;
        return mapped("share.open", params, required(shareResultOf), SHARE_PROTOCOL_VERSION);
      },
      async isAvailable() {
        const result = await call("share.getAvailability", void 0, SHARE_PROTOCOL_VERSION);
        return result.ok && result.value === true;
      }
    };
    const net = {
      async join(rawOptions) {
        const opts = rawOptions ?? {};
        const active = backend();
        if (!active.isAvailable() || active.protocolVersion() < REQUIRED_PROTOCOL_VERSION) {
          return unsupported();
        }
        closeCurrentRoom("replaced");
        const params = { mode: typeof opts.mode === "string" && opts.mode ? opts.mode : "default" };
        if (typeof opts.roomCode === "string" && opts.roomCode) params.roomCode = opts.roomCode;
        const result = await active.call("net.join", params);
        if (!result.ok) return result;
        const { source, info } = result.value ?? {};
        if (!source || !info || typeof info.roomId !== "string" || !info.roomId) {
          return failure(CODES.internal, "GameRush returned an unreadable room.");
        }
        const room = createRoom(source, info, (closedRoom) => {
          if (currentRoom === closedRoom) currentRoom = null;
        });
        currentRoom = room;
        return ok(room);
      },
      get room() {
        return currentRoom;
      }
    };
    return {
      VERSION,
      CODES,
      CHANNEL_RELIABLE: "reliable",
      CHANNEL_UNRELIABLE: "unreliable",
      EVERYONE: -1,
      MAX_MESSAGE_BYTES,
      get backend() {
        return backend().kind;
      },
      configure(settings) {
        if (!BACKENDS.has(settings?.backend) || settings.backend === selection) return;
        const previous = currentRoom;
        currentRoom = null;
        previous?.leave();
        selection = settings.backend;
      },
      isAvailable() {
        const active = backend();
        return active.isAvailable() && active.protocolVersion() >= REQUIRED_PROTOCOL_VERSION;
      },
      protocolVersion: () => backend().protocolVersion(),
      player,
      leaderboards,
      playerState,
      cloudSave,
      share,
      net,
      mock: mockBackend.controls
    };
  }
  function pageParams(key, options, names) {
    const params = { key };
    for (const name of names) {
      if (typeof options?.[name] === "number") params[name] = options[name];
    }
    return params;
  }

  // src/index.js
  var GRush = createGRush();

  // src/global.js
  globalThis.GRushSdk = GRush;
  if (globalThis.GRush === void 0) globalThis.GRush = GRush;
})();
