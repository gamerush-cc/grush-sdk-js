import { createMockBackend, defaultMockConfig } from "./backend-mock.js";
import { createWebBackend, isRuntimePresent } from "./backend-web.js";
import { MAX_MESSAGE_BYTES } from "./bytes.js";
import {
  cloudSaveOf,
  leaderboardDefinitionOf,
  leaderboardPageOf,
  playerOf,
  playerStateOf,
  shareResultOf,
  submitResultOf,
} from "./normalize.js";
import { CODES, failure, ok, unsupported } from "./result.js";
import { createRoom } from "./room.js";

export const VERSION = "0.2.0";
const REQUIRED_PROTOCOL_VERSION = 1;
const PLAYER_STATE_PROTOCOL_VERSION = 2;
const SHARE_PROTOCOL_VERSION = 3;
const BACKENDS = new Set(["auto", "web", "mock", "none"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const noneBackend = {
  kind: "none",
  isAvailable: () => false,
  protocolVersion: () => 0,
  call: async () => unsupported(),
};

function isLocalDevelopment() {
  const location = globalThis.location;
  if (!location) return false;
  return location.protocol === "file:" || LOCAL_HOSTNAMES.has(location.hostname);
}

export function createGRush(options = {}) {
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
    if (value === undefined)
      return failure(CODES.internal, `GameRush returned an unreadable ${method} result.`);
    return ok(value);
  }

  const orNull = (normalize) => (raw) => (raw == null ? null : normalize(raw));
  const required = (normalize) => (raw) => normalize(raw) ?? undefined;
  const listOf = (normalize) => (raw) =>
    Array.isArray(raw) ? raw.map(normalize).filter((item) => item !== null) : [];
  const playerCall = (method) => () => mapped(method, undefined, required(playerOf));
  const statesCall = (method, params, pick) =>
    mapped(method, params, pick, PLAYER_STATE_PROTOCOL_VERSION);

  const player = {
    getSelf: playerCall("player.getSelf"),
    requestProfile: playerCall("player.requestProfile"),
    revokeProfile: playerCall("player.revokeProfile"),
  };

  const leaderboards = {
    list: () => mapped("leaderboard.list", undefined, listOf(leaderboardDefinitionOf)),
    submit(key, value, rawExtra) {
      const extra = rawExtra ?? {};
      const params = { key, value };
      if (extra.metadata !== undefined) params.metadata = extra.metadata;
      if (typeof extra.operationId === "string") params.operationId = extra.operationId;
      return mapped("leaderboard.submit", params, required(submitResultOf));
    },
    top: (key, opts) =>
      mapped(
        "leaderboard.top",
        pageParams(key, opts, ["limit", "offset"]),
        required(leaderboardPageOf),
      ),
    aroundMe: (key, opts) =>
      mapped("leaderboard.aroundMe", pageParams(key, opts, ["range"]), required(leaderboardPageOf)),
    friends: (key, opts) =>
      mapped("leaderboard.friends", pageParams(key, opts, ["limit"]), required(leaderboardPageOf)),
  };

  const playerState = {
    getMine: () => statesCall("playerState.getMine", undefined, orNull(playerStateOf)),
    setMine(payload, baseRevision) {
      const params = { payload };
      if (typeof baseRevision === "number") params.baseRevision = baseRevision;
      return statesCall("playerState.setMine", params, required(playerStateOf));
    },
    get: (pseudoIds) => statesCall("playerState.get", { pseudoIds }, listOf(playerStateOf)),
    report: (pseudoId) => statesCall("playerState.report", { pseudoId }, (raw) => raw === true),
  };

  const cloudSave = {
    load: (slot) => mapped("cloudSave.load", { slot }, orNull(cloudSaveOf), 0),
    save(payload, slot, rawExtra) {
      const extra = rawExtra ?? {};
      const params = { payload, slot };
      if (typeof extra.baseRevision === "number") params.baseRevision = extra.baseRevision;
      return mapped("cloudSave.save", params, required(cloudSaveOf), 0);
    },
    remove: (slot) => mapped("cloudSave.remove", { slot }, () => true, 0),
  };

  const share = {
    share(rawOptions) {
      const opts = rawOptions ?? {};
      const params = {};
      if (opts.text !== undefined) params.text = opts.text;
      if (opts.image !== undefined) params.image = opts.image;
      return mapped("share.open", params, required(shareResultOf), SHARE_PROTOCOL_VERSION);
    },
    async isAvailable() {
      const result = await call("share.getAvailability", undefined, SHARE_PROTOCOL_VERSION);
      return result.ok && result.value === true;
    },
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
    },
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
    mock: mockBackend.controls,
  };
}

function pageParams(key, options, names) {
  const params = { key };
  for (const name of names) {
    if (typeof options?.[name] === "number") params[name] = options[name];
  }
  return params;
}
