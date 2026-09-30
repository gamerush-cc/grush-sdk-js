import { failure, failureFromCloudSaveError, failureFromError, ok, unsupported } from "./result.js";

function runtimeApi(name) {
  return globalThis[`GRush${name}`] ?? globalThis[`GameRush${name}`] ?? null;
}

export function isRuntimePresent() {
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
    serverTimeMs: typeof room.serverTimeMs === "function" ? room.serverTimeMs() : Date.now(),
  };
}

function roomSourceOf(room) {
  return {
    on: (name, handler) => room.on(name, handler),
    send: (bytes, options) => room.send(bytes, options),
    leave: () => room.leave(),
  };
}

const INVOKERS = {
  "player.getSelf": (apis) => apis.Player?.getSelf(),
  "player.requestProfile": (apis) => apis.Player?.requestProfile(),
  "player.revokeProfile": (apis) => apis.Player?.revokeProfile(),
  "leaderboard.list": (apis) => apis.Leaderboards?.list(),
  "leaderboard.submit": (apis, p) =>
    apis.Leaderboards?.submit(p.key, p.value, p.metadata, p.operationId),
  "leaderboard.top": (apis, p) => apis.Leaderboards?.top(p.key, p),
  "leaderboard.aroundMe": (apis, p) => apis.Leaderboards?.aroundMe(p.key, p),
  "leaderboard.friends": (apis, p) => apis.Leaderboards?.friends(p.key, p),
  "playerState.getMine": (apis) => apis.PlayerState?.getMine(),
  "playerState.setMine": (apis, p) => apis.PlayerState?.setMine(p.payload, p.baseRevision),
  "playerState.get": (apis, p) => apis.PlayerState?.get(p.pseudoIds),
  "playerState.report": (apis, p) => apis.PlayerState?.report(p.pseudoId),
  "share.open": (apis, p) => apis.Share?.share(p),
  "share.getAvailability": (apis) => apis.Share?.isAvailable(),
  "locale.get": (apis) => apis.Locale?.get(),
  "net.join": (apis, p) =>
    apis.Net?.join(p).then((room) =>
      room ? { source: roomSourceOf(room), info: describeRoom(room) } : null,
    ),
};

const CLOUD_SAVE_INVOKERS = {
  "cloudSave.load": (api, p) => api.loadWithMetadata(p.slot),
  "cloudSave.save": (api, p) => {
    const options = typeof p.baseRevision === "number" ? { baseRevision: p.baseRevision } : {};
    return api.save(p.payload, p.slot, options);
  },
  "cloudSave.remove": (api, p) => api.remove(p.slot),
};

function currentApis() {
  return {
    Player: runtimeApi("Player"),
    Leaderboards: runtimeApi("Leaderboards"),
    PlayerState: runtimeApi("PlayerState"),
    Net: runtimeApi("Net"),
    Share: runtimeApi("Share"),
    Locale: runtimeApi("Locale"),
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

export function createWebBackend() {
  return {
    kind: "web",
    isAvailable: () => isRuntimePresent(),
    protocolVersion() {
      const version = runtimeApi("Info")?.protocolVersion;
      return typeof version === "number" ? version : 0;
    },
    localeCurrent: () => runtimeApi("Locale")?.current?.() ?? null,
    localeOnChange(handler) {
      const unsubscribe = runtimeApi("Locale")?.onChange?.(handler);
      return typeof unsubscribe === "function" ? unsubscribe : () => {};
    },
    async call(method, params = {}) {
      if (method in CLOUD_SAVE_INVOKERS) return callCloudSave(method, params);
      const invoke = INVOKERS[method];
      if (!invoke) return failure("unsupported", `GameRush does not expose ${method}.`);
      try {
        const pending = invoke(currentApis(), params);
        if (pending === undefined) return unsupported();
        return ok(await pending);
      } catch (error) {
        return failureFromError(error);
      }
    },
  };
}
