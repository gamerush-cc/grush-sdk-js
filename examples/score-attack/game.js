const BOARD_KEY = "score";
const ROUND_MS = 10_000;

const tapButton = document.getElementById("tap");
const statusLine = document.getElementById("status");
const playerLine = document.getElementById("player");
const boardList = document.getElementById("board");

let taps = 0;
let roundEndsAt = 0;

if (GRush.backend === "mock") {
  GRush.mock.defineLeaderboard(BOARD_KEY, { title: "10 秒タップ", minValue: 0, maxValue: 500 });
  GRush.mock.addRival(BOARD_KEY, "Rival", 42);
}

async function showPlayer() {
  const self = await GRush.player.getSelf();
  if (!self.ok) {
    playerLine.textContent = `GameRush の外で動いています（${self.code}）`;
    return;
  }
  const name = self.value.displayName ?? (self.value.isGuest ? "ゲスト" : "名前は非公開");
  playerLine.textContent = `プレイヤー: ${name}`;
}

async function showBoard() {
  const top = await GRush.leaderboards.top(BOARD_KEY, { limit: 5 });
  boardList.replaceChildren();
  if (!top.ok) return;
  for (const entry of top.value.entries) {
    const item = document.createElement("li");
    const name = entry.displayName ?? (entry.isGuest ? "ゲスト" : "プレイヤー");
    item.textContent = `${name} — ${entry.value}${entry.isSelf ? "（あなた）" : ""}`;
    boardList.append(item);
  }
}

async function finishRound() {
  tapButton.textContent = "もう一度";
  const submitted = await GRush.leaderboards.submit(BOARD_KEY, taps);
  if (!submitted.ok) {
    statusLine.textContent = `${taps} 回（送信できませんでした: ${submitted.code}）`;
    return;
  }
  const rank = submitted.value.rank === null ? "" : ` / ${submitted.value.rank} 位`;
  statusLine.textContent = `${taps} 回${rank}`;
  await showBoard();
}

tapButton.addEventListener("click", () => {
  const now = Date.now();
  if (now >= roundEndsAt) {
    taps = 0;
    roundEndsAt = now + ROUND_MS;
    tapButton.textContent = "タップ！";
    setTimeout(finishRound, ROUND_MS);
    return;
  }
  taps += 1;
  statusLine.textContent = `${taps} 回`;
});

showPlayer();
showBoard();
