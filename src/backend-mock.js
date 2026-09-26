import { createMockLeaderboards } from "./mock-leaderboards.js";
import { createMockNet } from "./mock-net.js";
import { CODES, failure, ok } from "./result.js";

const STORAGE_KEY = "grush-sdk-mock";
const SLOT_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const PLAYER_STATE_MAX_BYTES = 4 * 1024;
const CLOUD_SAVE_MAX_BYTES = 256 * 1024;
const OPAQUE_STRING_MIN_LENGTH = 256;
const BASE64_LIKE = /^[A-Za-z0-9+/\-_]+={0,2}$/;

function containsOpaqueString(value) {
  if (typeof value === "string") {
    return value.length >= OPAQUE_STRING_MIN_LENGTH && BASE64_LIKE.test(value);
  }
  if (Array.isArray(value)) return value.some(containsOpaqueString);
  if (value && typeof value === "object") return Object.values(value).some(containsOpaqueString);
  return false;
}

export function defaultMockConfig() {
  return {
    signedIn: true,
    displayName: "Local Player",
    avatarUrl: null,
    grantProfileConsent: true,
    confirmPlayerStateReport: true,
    unreliableDropRate: 0,
    maxPeers: 8,
  };
}

let memoryStore = null;

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
  } catch {}
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

export function createMockBackend(config) {
  const otherStates = new Map();
  const cloudSaves = new Map();
  let myState = null;

  const consented = () => config.signedIn && readStored().consent === true;

  function playerWire() {
    return {
      pseudoId: localPseudoId(),
      isGuest: !config.signedIn,
      profileConsent: consented(),
      profile: { displayName: config.displayName, avatarUrl: config.avatarUrl },
    };
  }

  function localPeerWire(index) {
    return {
      index,
      pseudoId: localPseudoId(),
      displayName: consented() ? config.displayName : null,
      avatarUrl: consented() ? config.avatarUrl : null,
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
      updatedAt: new Date().toISOString(),
    };
    return ok(myState);
  }

  function getMany({ pseudoIds }) {
    if (!Array.isArray(pseudoIds) || pseudoIds.length === 0 || pseudoIds.length > 50) {
      return invalid("pseudoIds must be an array of at most 50 ids.");
    }
    const states = pseudoIds
      .map((id) => otherStates.get(id))
      .filter((state) => state && !state.hidden)
      .map(({ hidden: _hidden, ...state }) => state);
    return ok(states);
  }

  function saveCloud({ payload, slot, baseRevision }) {
    const key = slot || "default";
    if (!SLOT_PATTERN.test(key)) return invalid("Invalid cloud save slot.");
    if (payload === undefined || payload === null)
      return invalid("Cloud save payload is required.");
    if (jsonBytes(payload) > CLOUD_SAVE_MAX_BYTES)
      return invalid("Cloud save payload is too large.");
    if (!config.signedIn) return failure(CODES.signInRequired, "Cloud save requires sign-in.");
    const current = cloudSaves.get(key);
    const revision = current ? current.revision : 0;
    if (typeof baseRevision === "number" && baseRevision !== revision) {
      return failure(CODES.conflict, "Cloud save was updated elsewhere.");
    }
    const now = new Date().toISOString();
    const save = {
      slot: key,
      payload: structuredClone(payload),
      revision: revision + 1,
      createdAt: current ? current.createdAt : now,
      updatedAt: now,
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
    "leaderboard.submit": (p) =>
      fromBoard(leaderboards.submit(p.key, p.value, p.metadata), (o) => o.result),
    "leaderboard.top": (p) => fromBoard(leaderboards.page(p.key, p, false), (o) => o.page),
    "leaderboard.aroundMe": (p) => fromBoard(leaderboards.page(p.key, p, true), (o) => o.page),
    "leaderboard.friends": () =>
      failure(CODES.consentDeclined, "Friend leaderboards require per-game friend consent."),
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
    "net.join": (p) => {
      const joined = net.join(p);
      if (joined === null) return failure(CODES.internal, "Failed to join a room.");
      return ok(joined);
    },
  };

  const controls = {
    config,
    defineLeaderboard: (key, options) => leaderboards.define(key, options),
    addRival: (key, displayName, value, options) =>
      leaderboards.addRival(key, displayName, value, options),
    definePlayerState(pseudoId, payload, options = {}) {
      otherStates.set(pseudoId, {
        pseudoId,
        payload: structuredClone(payload),
        revision: 1,
        updatedAt: new Date().toISOString(),
        hidden: options.hidden === true,
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
    },
  };

  return {
    kind: "mock",
    controls,
    isAvailable: () => true,
    protocolVersion: () => 2,
    async call(method, params = {}) {
      const handler = handlers[method];
      if (!handler) return failure(CODES.unsupported, `The mock does not implement ${method}.`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        return snapshot(handler(params ?? {}));
      } catch (error) {
        return invalid(error instanceof Error ? error.message : "The mock rejected the call.");
      }
    },
  };
}
