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

  const local = createGRush({ backend: "mock" });
  local.mock.config.shareStatus = "cancelled";
  local.mock.defineLeaderboard("score", { sort: "asc", minValue: 0 });
  local.mock.config.unreliableDropRate = 0.2;
  window.GRush.configure({ backend: "auto" });
}

void useSdk;
