import { CODES, failure, ok } from "./result.js";

// The same shape rules GameRush applies to inbox payloads and trade items: an object whose strings and
// keys are short identifiers, so no free text or images can travel between players.
const TOKEN = /^[A-Za-z0-9_.:-]{1,32}$/;
const KEY = /^[A-Za-z0-9._:-]{1,32}$/;
const OPERATION_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEPTH = 4;
const MAX_SCALARS = 64;
const INBOX_MAX_BYTES = 1024;
const OFFER_MAX_BYTES = 2048;
const WANT_MAX_BYTES = 1024;
const GIVE_MAX_BYTES = 2048;
const MAX_IDS = 50;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OPEN_TRADES = 10;
const PENDING_LIMIT = 100;
const DEFAULT_EXPIRES_IN_SEC = 3 * 24 * 60 * 60;
const MIN_EXPIRES_IN_SEC = 10 * 60;
const MAX_EXPIRES_IN_SEC = 7 * 24 * 60 * 60;

export const MOCK_RIVALS = Object.freeze(["mock-rival-1", "mock-rival-2", "mock-rival-3"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(value, depth, state) {
  if (Array.isArray(value) || isPlainObject(value)) {
    if (depth > MAX_DEPTH) return `${state.label} must not nest deeper than ${MAX_DEPTH} levels.`;
    const entries = Array.isArray(value)
      ? value.map((item) => [null, item])
      : Object.entries(value);
    for (const [key, item] of entries) {
      if (key !== null && !TOKEN.test(key)) {
        return `${state.label} keys must be 1-32 letters, digits, or _ . : -`;
      }
      const error = walk(item, depth + 1, state);
      if (error) return error;
    }
    return null;
  }
  state.scalars += 1;
  if (state.scalars > MAX_SCALARS) return `${state.label} must hold at most ${MAX_SCALARS} values.`;
  if (typeof value === "string") {
    return TOKEN.test(value)
      ? null
      : `${state.label} strings must be 1-32 letters, digits, or _ . : - (no free text).`;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : `${state.label} numbers must be finite.`;
  }
  if (typeof value === "boolean" || value === null) return null;
  return `${state.label} must be JSON.`;
}

export function payloadError(value, maxBytes, label) {
  if (!isPlainObject(value)) return `${label} must be a JSON object.`;
  const error = walk(value, 1, { scalars: 0, label });
  if (error) return error;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) {
    return `${label} must be ${maxBytes} bytes or smaller.`;
  }
  return null;
}

function idsOf(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IDS) return null;
  const ids = new Set();
  for (const entry of value) {
    if (typeof entry !== "string" || !UUID.test(entry)) return null;
    ids.add(entry.toLowerCase());
  }
  return ids;
}

function limitOf(value) {
  if (value === undefined || value === null) return DEFAULT_LIMIT;
  return Number.isInteger(value) && value >= 1 && value <= MAX_LIMIT ? value : null;
}

function uuid() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function invalid(message) {
  return failure(CODES.invalidParams, message);
}

// Everything kept here passed the payload rules, so it is plain JSON. A JSON round trip copies it without
// relying on structuredClone, which the mock must not need just to be created.
function copy(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

// A page of `items` (newest first) after the item whose id is `cursor`.
function pageOf(items, limit, cursor) {
  let start = 0;
  if (cursor !== undefined && cursor !== null) {
    const at = typeof cursor === "string" ? items.findIndex((item) => item.id === cursor) : -1;
    if (at === -1) return null;
    start = at + 1;
  }
  const page = items.slice(start, start + limit);
  const nextCursor = start + limit < items.length && page.length > 0 ? page.at(-1).id : null;
  return { page, nextCursor };
}

// The inbox and the trades of the mock. Handlers resolve the same bare values as the GameRush runtime
// (true, a count, a trade…), not the RPC results that wrap them.
// Rivals reply to every inbox message with the same kind and
// payload, and own a few open trades, so sending, receiving, listing, accepting, pending and ack all
// work without GameRush. Blocks from reports are shared by the inbox and the trades, like on GameRush.
export function createMockSocial({ config, selfId, isKnownPlayer, now = () => Date.now() }) {
  let messages = [];
  let trades = [];
  const blocked = new Set();

  const iso = (ms) => new Date(ms).toISOString();

  function deliver(from, kind, payload) {
    if (blocked.has(from)) return;
    messages.push({
      id: uuid(),
      from,
      kind,
      payload: copy(payload),
      createdAt: iso(now()),
      readAt: null,
      removed: false,
    });
  }

  function visibleMessages() {
    return messages.filter((message) => !message.removed && !blocked.has(message.from)).reverse();
  }

  function messageWire({ removed: _removed, ...message }) {
    return copy(message);
  }

  function send({ to, kind, payload }) {
    if (typeof to !== "string" || !to) return invalid("Invalid recipient.");
    if (to === selfId()) return invalid("Cannot send a message to yourself.");
    if (!isKnownPlayer(to)) return invalid("No player with that id.");
    if (typeof kind !== "string" || !KEY.test(kind)) return invalid("Invalid kind.");
    const error = payloadError(payload, INBOX_MAX_BYTES, "Inbox payload");
    if (error) return invalid(error);
    deliver(to, kind, payload);
    return ok(true);
  }

  function list({ unreadOnly, limit, cursor }) {
    const size = limitOf(limit);
    if (size === null) return invalid("Invalid limit.");
    const visible = visibleMessages();
    const filtered = unreadOnly === true ? visible.filter((message) => !message.readAt) : visible;
    const found = pageOf(filtered, size, cursor);
    if (!found) return invalid("Invalid cursor.");
    return ok({
      messages: found.page.map(messageWire),
      unreadCount: visible.filter((message) => !message.readAt).length,
      nextCursor: found.nextCursor,
    });
  }

  function updateMessages(rawIds, apply) {
    const ids = idsOf(rawIds);
    if (!ids) return invalid("ids must be 1 to 50 message ids.");
    let updated = 0;
    for (const message of visibleMessages()) {
      if (ids.has(message.id.toLowerCase()) && apply(message)) updated += 1;
    }
    return ok(updated);
  }

  const markRead = ({ ids }) =>
    updateMessages(ids, (message) => {
      if (message.readAt) return false;
      message.readAt = iso(now());
      return true;
    });

  const removeMessages = ({ ids }) =>
    updateMessages(ids, (message) => {
      message.removed = true;
      return true;
    });

  function reportMessage({ messageId }) {
    if (!config.signedIn) return failure(CODES.signInRequired, "Reporting requires sign-in.");
    const target = visibleMessages().find((message) => message.id === messageId);
    if (!target) return invalid("No message for that id.");
    if (config.confirmInboxReport !== true) return ok(false);
    blocked.add(target.from);
    return ok(true);
  }

  function expireDue() {
    const at = now();
    for (const trade of trades) {
      if (trade.status === "open" && Date.parse(trade.expiresAt) <= at) {
        trade.status = "expired";
        trade.settledAt = trade.expiresAt;
      }
    }
  }

  function tradeWire(trade) {
    const { ackedBy: _ackedBy, operationId: _operationId, ...wire } = trade;
    const party = trade.from === selfId() || trade.taker === selfId();
    return copy({ ...wire, give: party ? trade.give : null });
  }

  function openTrade(from, { offer, want, offerKey, wantKey, to, expiresInSec, operationId }) {
    const createdAt = now();
    const trade = {
      id: uuid(),
      from,
      to: to ?? null,
      taker: null,
      offer: copy(offer),
      want: copy(want),
      offerKey: offerKey ?? null,
      wantKey: wantKey ?? null,
      give: null,
      status: "open",
      createdAt: iso(createdAt),
      expiresAt: iso(createdAt + (expiresInSec ?? DEFAULT_EXPIRES_IN_SEC) * 1000),
      settledAt: null,
      ackedBy: new Set(),
      operationId: operationId ?? null,
    };
    trades.push(trade);
    return trade;
  }

  function tradeOptionsError(p) {
    const offerError = payloadError(p.offer, OFFER_MAX_BYTES, "Trade offer");
    if (offerError) return offerError;
    const wantError = payloadError(p.want, WANT_MAX_BYTES, "Trade want");
    if (wantError) return wantError;
    for (const name of ["offerKey", "wantKey"]) {
      const value = p[name];
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== "string" || !KEY.test(value))
      ) {
        return `Invalid ${name}.`;
      }
    }
    const seconds = p.expiresInSec;
    if (
      seconds !== undefined &&
      seconds !== null &&
      !(Number.isInteger(seconds) && seconds >= MIN_EXPIRES_IN_SEC && seconds <= MAX_EXPIRES_IN_SEC)
    ) {
      return "Invalid expiresInSec.";
    }
    return null;
  }

  function create(p) {
    const error = tradeOptionsError(p);
    if (error) return invalid(error);
    if (typeof p.operationId !== "string" || !OPERATION_ID.test(p.operationId)) {
      return invalid("Invalid operationId.");
    }
    const self = selfId();
    if (p.to !== undefined && p.to !== null) {
      if (typeof p.to !== "string" || !p.to) return invalid("Invalid recipient.");
      if (p.to === self) return invalid("Cannot offer a trade to yourself.");
      if (!isKnownPlayer(p.to)) return invalid("No player with that id.");
    }
    // A retry with the same operationId returns the listing made first, whatever it carries.
    const existing = trades.find(
      (trade) => trade.from === self && trade.operationId === p.operationId,
    );
    if (existing) return ok(tradeWire(existing));
    expireDue();
    const open = trades.filter((trade) => trade.from === self && trade.status === "open");
    if (open.length >= MAX_OPEN_TRADES) {
      return failure(CODES.rateLimited, "Too many open trades.");
    }
    return ok(tradeWire(openTrade(self, p)));
  }

  function listTrades({ offerKey, wantKey, limit, cursor }) {
    const size = limitOf(limit);
    if (size === null) return invalid("Invalid limit.");
    expireDue();
    const self = selfId();
    const visible = trades
      .filter(
        (trade) =>
          trade.status === "open" &&
          trade.from !== self &&
          (trade.to === null || trade.to === self) &&
          !blocked.has(trade.from) &&
          (offerKey === undefined || offerKey === null || trade.offerKey === offerKey) &&
          (wantKey === undefined || wantKey === null || trade.wantKey === wantKey),
      )
      .reverse();
    const found = pageOf(visible, size, cursor);
    if (!found) return invalid("Invalid cursor.");
    return ok({ trades: found.page.map(tradeWire), nextCursor: found.nextCursor });
  }

  function pendingOf(trade, self) {
    if (trade.status === "open" || trade.ackedBy.has(self)) return null;
    if (trade.from === self) {
      return {
        ...tradeWire(trade),
        role: "offerer",
        action: trade.status === "matched" ? "receiveGive" : "returnOffer",
      };
    }
    if (trade.taker === self) return { ...tradeWire(trade), role: "taker", action: "receiveOffer" };
    return null;
  }

  function mine() {
    expireDue();
    const self = selfId();
    const open = trades
      .filter((trade) => trade.from === self && trade.status === "open")
      .reverse()
      .map(tradeWire);
    const pending = trades
      .map((trade) => pendingOf(trade, self))
      .filter((trade) => trade !== null)
      .sort((a, b) => Date.parse(a.settledAt) - Date.parse(b.settledAt))
      .slice(0, PENDING_LIMIT);
    return ok({ open, pending });
  }

  function settle(tradeId, give, taker) {
    expireDue();
    const trade = trades.find((entry) => entry.id === tradeId);
    if (
      !trade ||
      trade.from === taker ||
      (trade.to !== null && trade.to !== taker) ||
      blocked.has(trade.from)
    ) {
      return { outcome: "notFound" };
    }
    if (trade.status === "matched") {
      return trade.taker === taker ? { outcome: "matched", trade } : { outcome: "taken" };
    }
    if (trade.status !== "open") return { outcome: trade.status };
    trade.taker = taker;
    trade.give = copy(give);
    trade.status = "matched";
    trade.settledAt = iso(now());
    return { outcome: "matched", trade };
  }

  function accept({ tradeId, give }) {
    if (typeof tradeId !== "string" || !tradeId) return invalid("Invalid tradeId.");
    const error = payloadError(give, GIVE_MAX_BYTES, "Trade give");
    if (error) return invalid(error);
    const settled = settle(tradeId, give, selfId());
    return ok(
      settled.trade
        ? { outcome: settled.outcome, trade: tradeWire(settled.trade) }
        : { outcome: settled.outcome, trade: null },
    );
  }

  function cancel({ tradeId }) {
    expireDue();
    const trade = trades.find((entry) => entry.id === tradeId && entry.from === selfId());
    if (!trade) return invalid("No trade of yours for that id.");
    if (trade.status === "open") {
      trade.status = "cancelled";
      trade.settledAt = iso(now());
    }
    return ok(tradeWire(trade));
  }

  function ack({ ids: rawIds }) {
    const ids = idsOf(rawIds);
    if (!ids) return invalid("ids must be 1 to 50 trade ids.");
    expireDue();
    const self = selfId();
    let acked = 0;
    for (const trade of trades) {
      if (!ids.has(trade.id.toLowerCase()) || !pendingOf(trade, self)) continue;
      trade.ackedBy.add(self);
      acked += 1;
    }
    return ok(acked);
  }

  function reportTrade({ tradeId }) {
    if (!config.signedIn) return failure(CODES.signInRequired, "Reporting requires sign-in.");
    expireDue();
    const self = selfId();
    const trade = trades.find((entry) => entry.id === tradeId);
    const listed =
      trade &&
      trade.status === "open" &&
      trade.from !== self &&
      (trade.to === null || trade.to === self);
    if (!trade || !(listed || trade.taker === self)) return invalid("No trade for that id.");
    if (config.confirmTradeReport !== true) return ok(false);
    blocked.add(trade.from);
    return ok(true);
  }

  function seed() {
    messages = [];
    trades = [];
    blocked.clear();
    deliver(MOCK_RIVALS[0], "challenge", { stage: 3, score: 1200 });
    openTrade(MOCK_RIVALS[0], {
      offer: { item: "sword", count: 1 },
      want: { item: "gem", count: 3 },
      offerKey: "sword",
      wantKey: "gem",
    });
    openTrade(MOCK_RIVALS[1], {
      offer: { item: "shield", count: 1 },
      want: { item: "coin", count: 100 },
      offerKey: "shield",
      wantKey: "coin",
    });
  }

  seed();

  const controls = {
    receiveInbox(from, kind, payload) {
      if (typeof from !== "string" || !from || from === selfId()) return false;
      if (typeof kind !== "string" || !KEY.test(kind)) return false;
      if (payloadError(payload, INBOX_MAX_BYTES, "Inbox payload")) return false;
      if (blocked.has(from)) return false;
      deliver(from, kind, payload);
      return true;
    },
    offerTrade(from, offer, want, options = {}) {
      const opts = options ?? {};
      if (typeof from !== "string" || !from || from === selfId()) return null;
      if (tradeOptionsError({ ...opts, offer, want })) return null;
      const to = opts.toSelf === true ? selfId() : null;
      return tradeWire(openTrade(from, { ...opts, offer, want, to, operationId: null }));
    },
    acceptTrade(tradeId, give, by = MOCK_RIVALS[0]) {
      if (typeof by !== "string" || !by || by === selfId()) return "notFound";
      if (payloadError(give, GIVE_MAX_BYTES, "Trade give")) return "notFound";
      const trade = trades.find((entry) => entry.id === tradeId);
      if (!trade || trade.from !== selfId()) return "notFound";
      return settle(tradeId, give, by).outcome;
    },
    expireTrade(tradeId) {
      const trade = trades.find((entry) => entry.id === tradeId && entry.status === "open");
      if (!trade) return false;
      trade.expiresAt = iso(now());
      expireDue();
      return true;
    },
  };

  return {
    controls,
    reset: seed,
    handlers: {
      send,
      list,
      markRead,
      removeMessages,
      reportMessage,
      create,
      listTrades,
      mine,
      accept,
      cancel,
      ack,
      reportTrade,
    },
  };
}
