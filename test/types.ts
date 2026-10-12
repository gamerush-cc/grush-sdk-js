import GRush, { createGRush, type GRushMessage, type GRushRoom } from "../grush-sdk";

async function useSdk(): Promise<void> {
  const submitted = await GRush.leaderboards.submit("score", 10, { operationId: "run-1" });
  if (submitted.ok) {
    const rank: number | null = submitted.value.rank;
    void rank;
  } else {
    const code: string = submitted.code;
    void code;
  }

  const joined = await GRush.net.join({ mode: "duel" });
  if (!joined.ok) return;
  const room: GRushRoom = joined.value;
  room.on("message", (message: GRushMessage) => {
    void message.json();
  });
  room.on("peerleave", (event) => {
    const index: number = event.index;
    void index;
  });
  room.send(new Uint8Array([1]), { channel: GRush.CHANNEL_UNRELIABLE, to: GRush.EVERYONE });

  if (await GRush.share.isAvailable()) {
    const shared = await GRush.share.share({ text: "Stage 3 clear", image: "screen" });
    const status: "opened" | "cancelled" | null = shared.ok ? shared.value.status : null;
    void status;
    await GRush.share.share({ image: { base64: "AAAA", mimeType: "image/png" } });
    await GRush.share.share({ image: new Uint8Array([1]) });
  }

  const language = await GRush.locale.get();
  const tag: string | null = language.ok ? language.value.locale : null;
  const langs: string[] = GRush.locale.current()?.languages ?? [];
  const stop: () => void = GRush.locale.onChange((next) => {
    const source: string = next.source;
    void source;
  });
  void tag;
  void langs;
  stop();

  const loaded = await GRush.cloudSave.load("default", { fallback: "local" });
  if (loaded.ok && loaded.value) {
    const storage: "cloud" | "local" = loaded.value.storage;
    void storage;
    await GRush.cloudSave.save(loaded.value.payload, "default", {
      baseRevision: loaded.value.revision,
      fallback: "local",
    });
  }
  await GRush.cloudSave.remove("default", { fallback: "local" });
  // @ts-expect-error fallback takes only "local".
  await GRush.cloudSave.load("default", { fallback: "cloud" });

  const sampled = await GRush.playerState.sample({ count: 5, minRating: 900, maxRating: 1100 });
  const ratings: (number | null)[] = sampled.ok ? sampled.value.map((state) => state.rating) : [];
  void ratings;
  await GRush.playerState.setMine({ level: 3 }, undefined, { rating: 1000 });
  await GRush.playerState.setMine({ level: 3 }, 2, { rating: null });

  const sent = await GRush.inbox.send("p2", "result", { stage: 3, win: true, items: ["gem"] });
  const delivered: boolean = sent.ok && sent.value;
  void delivered;
  const page = await GRush.inbox.list({ unreadOnly: true, limit: 10 });
  if (page.ok) {
    const unread: number = page.value.unreadCount;
    const readAt: string | null = page.value.messages[0]?.readAt ?? null;
    const updated = await GRush.inbox.markRead(page.value.messages.map((message) => message.id));
    const count: number = updated.ok ? updated.value : 0;
    void unread;
    void readAt;
    void count;
  }

  const created = await GRush.trade.create({
    offer: { item: "sword", count: 1 },
    want: { item: "gem", count: 3 },
    offerKey: "sword",
    operationId: "listing-1",
  });
  const tradeId: string | null = created.ok ? created.value.id : null;
  void tradeId;
  // @ts-expect-error operationId is required.
  await GRush.trade.create({ offer: {}, want: {} });
  const mine = await GRush.trade.mine();
  if (mine.ok) {
    for (const pending of mine.value.pending) {
      const action: string = pending.action;
      const give = pending.give;
      void action;
      void give;
    }
    await GRush.trade.ack(mine.value.pending.map((trade) => trade.id));
  }
  const accepted = await GRush.trade.accept("t1", { item: "gem", count: 3 });
  if (accepted.ok && accepted.value.outcome === "matched") {
    const status: string = accepted.value.trade?.status ?? "";
    void status;
  }

  const local = createGRush({ backend: "mock" });
  const [rival] = local.mock.rivals;
  local.mock.receiveInbox(rival, "challenge", { stage: 1 });
  const listing = local.mock.offerTrade(rival, { item: "a" }, { item: "b" }, { toSelf: true });
  if (listing) local.mock.expireTrade(listing.id);
  local.mock.config.confirmTradeReport = false;
  local.mock.definePlayerState("p9", { level: 1 }, { rating: 1200 });
  local.mock.config.shareStatus = "cancelled";
  local.mock.defineLeaderboard("score", { sort: "asc", minValue: 0 });
  local.mock.defineLeaderboard("daily", { period: "daily", enabled: false });
  const manifest = local.mock.loadLeaderboards({
    leaderboards: [
      {
        key: "high_score",
        title: "High score",
        sort: "desc",
        valueType: "int",
        aggregation: "best",
        period: "weekly",
        minValue: 0,
        maxValue: 1000,
      },
    ],
  });
  const keys: string[] = manifest.ok ? manifest.value : [];
  void keys;
  local.mock.loadLeaderboards("{}");
  local.mock.config.unreliableDropRate = 0.2;
  window.GRush.configure({ backend: "auto" });
}

void useSdk;
