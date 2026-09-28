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

  const local = createGRush({ backend: "mock" });
  local.mock.config.shareStatus = "cancelled";
  local.mock.defineLeaderboard("score", { sort: "asc", minValue: 0 });
  local.mock.config.unreliableDropRate = 0.2;
  window.GRush.configure({ backend: "auto" });
}

void useSdk;
