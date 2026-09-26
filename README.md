# GameRush SDK for JavaScript

GameRush の GameAPI（ランキング・公開プレイヤー状態・クラウドセーブ・リアルタイム対戦）を、素の `index.html` のゲームから呼ぶためのラッパー。バンドラ不要で、script タグ 1 行でも ES Modules の `import` でも使える。使い方の正（投稿が弾かれる条件とエラーコード・API トークン）は [SDK ガイド](https://gamerush.jp/sdk)。

GameRush はアップロードされた全ビルドへランタイム JS（`window.GRushPlayer` など）を注入している。この SDK はその上に薄く乗り、次の 3 つを足す。

- **例外を投げない。** すべての API が `{ ok, value, code, message }` を返す。GameRush の外では `code: "unsupported"` になるだけで、ゲームは止まらない
- **ローカルで動く。** `localhost` と `file://` では自動でモックに切り替わり、アップロードせずにランキングや対戦を試せる
- **形がそろう。** 名前・アバターは同意がある時だけ入り、`verified` は常に `false`（スコアは自己申告）

## 導入

どれか 1 つ。

```bash
git submodule add https://github.com/gamerush-cc/grush-sdk-js.git vendor/grush-sdk-js
```

```html
<script src="https://cdn.jsdelivr.net/gh/gamerush-cc/grush-sdk-js@v0.1.0/grush-sdk.js"></script>
```

CDN から読むときは版を固定すること（`@main` だと、アップロード済みのビルドの挙動が後から変わる）。

`grush-sdk.js`（グローバル版）か `grush-sdk.mjs`（ESM 版）をゲームのフォルダへコピーするだけでもよい。依存は無い。

## 使い方

### script タグ

```html
<script src="vendor/grush-sdk-js/grush-sdk.js"></script>
<script>
  GRush.leaderboards.submit("score", 1200).then((result) => {
    if (result.ok) console.log("rank", result.value.rank);
    else console.log("not sent", result.code);
  });
</script>
```

`window.GRush` に入る（同名のグローバルが既にあるときは上書きせず、`window.GRushSdk` だけに入る）。

### ES Modules

```html
<script type="module">
  import GRush from "./vendor/grush-sdk-js/grush-sdk.mjs";

  const self = await GRush.player.getSelf();
  if (self.ok) console.log(self.value.pseudoId);
</script>
```

TypeScript の型は `grush-sdk.d.ts`。

## API

| 呼び出し | 返る `value` |
|---|---|
| `GRush.player.getSelf()` / `requestProfile()` / `revokeProfile()` | `{ pseudoId, isGuest, profileConsent, displayName, avatarUrl }` |
| `GRush.leaderboards.list()` | ランキング定義の配列（定義は Studio で作者が宣言する） |
| `GRush.leaderboards.submit(key, value, { metadata, operationId })` | `{ accepted, updated, value, rank, verified }` |
| `GRush.leaderboards.top(key, { limit, offset })` / `aroundMe(key, { range })` / `friends(key, { limit })` | `{ key, title, entries, total, verified, ... }` |
| `GRush.playerState.getMine()` / `setMine(payload, baseRevision)` / `get(pseudoIds)` / `report(pseudoId)` | `{ pseudoId, payload, revision, updatedAt }` など |
| `GRush.cloudSave.load(slot)` / `save(payload, slot, { baseRevision })` / `remove(slot)` | `{ slot, payload, revision, createdAt, updatedAt }` など |
| `GRush.net.join({ mode, roomCode })` | 部屋（下記） |

失敗時の `code` は `unsupported` / `unavailable` / `timeout` / `rateLimited`（`retryAfterMs` 付き）/ `signInRequired` / `consentDeclined` / `invalidParams` / `conflict`（クラウドセーブの版ずれ）/ `internal`。

集約が `sum` のランキングへ投稿を再送するときは、必ず同じ `operationId` を渡すこと。渡さないと二重に加算される。

### 対戦

```js
const joined = await GRush.net.join({ mode: "duel" });
if (joined.ok) {
  const room = joined.value;
  room.on("message", (message) => {
    if (message.isStale) return;
    console.log(message.from, message.json());
  });
  room.on("peerjoin", (peer) => console.log("joined", peer.index));
  room.on("close", ({ reason }) => console.log("closed", reason));
  room.sendJson({ x: 1, y: 2 }, { channel: GRush.CHANNEL_UNRELIABLE });
}
```

- 送れるのは `ArrayBuffer` / 型付き配列 / 文字列（`sendJson` は JSON 文字列）。1 通 8KB まで
- `channel: "unreliable"` は落ちる・順序が入れ替わる前提で書く。いまの中継では落ちないが、WebRTC へ切り替わった時点で落ち始める
- `to` に peer の `index` を渡すとその相手だけへ送る。省略すると全員
- `join` をもう一度呼ぶと、前の部屋は `close`（reason `"replaced"`）になる
- 部屋のプロパティ: `peers` / `localPeerId` / `hostPeerId` / `isHost()` / `transport` / `serverTimeMs()` / `lastSeqFrom(peerId)` / `isClosed`

## ローカルでの動作確認

`localhost`・`127.0.0.1`・`file://` では `GRush.backend` が `"mock"` になる（ESM 版は `file://` だとブラウザが読み込みを拒むので、ローカルサーバから開く）。GameRush 上では `"web"`、それ以外のサイトでは `"none"`。`GRush.configure({ backend: "mock" })` で強制もできる。

```js
if (GRush.backend === "mock") {
  GRush.mock.defineLeaderboard("score", { sort: "desc", minValue: 0, maxValue: 100000 });
  GRush.mock.addRival("score", "Rival", 900);
  GRush.mock.config.signedIn = true;
  GRush.mock.config.grantProfileConsent = false;
  GRush.mock.config.unreliableDropRate = 0.1;

  const bot = GRush.mock.addPeer("Sparring Partner");
  bot.on("message", (message) => bot.send(message.payload));
}
```

モックは実サーバと同じ縛り（宣言していない key への投稿・値域外・int の枠への小数・公開プレイヤー状態の 4KB と base64 らしい文字列・ゲストのクラウドセーブと通報・部屋コードの形式）で弾く。有効プレイ 10 秒未満の投稿と投稿頻度の上限は再現しない。

**`unreliableDropRate` は既定 0 だが、出荷前に必ず 0 より大きくして試すこと。** パケットが落ちる前提で書けているかを確かめられる場所はここだけになる。

## サンプル

| サンプル | 内容 |
|---|---|
| [`examples/score-attack/`](examples/score-attack/index.html) | 10 秒タップ。ランキングへの投稿と上位表示。このリポジトリの直下で `npx serve` などを起動し、`http://localhost:3000/examples/score-attack/` を開くとモックで動く |

## 開発

`src/` が正で、`grush-sdk.js` / `grush-sdk.mjs` はそこからの生成物（コミットしてある）。`src/` を直したら生成し直してコミットする。

```bash
npm install
npm run build
npm test
```

`npm test` は生成物が `src/` と食い違っていると失敗する。
