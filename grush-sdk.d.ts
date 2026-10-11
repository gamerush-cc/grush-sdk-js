export type GRushCode =
  | "unsupported"
  | "unavailable"
  | "timeout"
  | "rateLimited"
  | "signInRequired"
  | "consentDeclined"
  | "invalidParams"
  | "conflict"
  | "internal";

export type GRushResult<T> =
  | { ok: true; value: T; code: ""; message: "" }
  | { ok: false; value: null; code: GRushCode; message: string; retryAfterMs?: number };

export type GRushBackendKind = "web" | "mock" | "none";
export type GRushBackendSelection = "auto" | GRushBackendKind;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type GRushPlayer = {
  pseudoId: string;
  isGuest: boolean;
  profileConsent: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

export type GRushLeaderboardDefinition = {
  key: string;
  title: string;
  sort: "asc" | "desc";
  valueType: string;
  aggregation: string;
  period: string;
  minValue: number | null;
  maxValue: number | null;
};

export type GRushLeaderboardManifestEntry = {
  key: string;
  title: string;
  sort: "asc" | "desc";
  valueType: "int" | "float" | "duration_ms";
  aggregation: "best" | "last" | "sum";
  period: "all_time" | "daily" | "weekly" | "monthly";
  minValue?: number | null;
  maxValue?: number | null;
  enabled?: boolean;
};

/** ビルドの最上位に置く `grush.json` の中身。アップロードでランキングの定義になる。 */
export type GRushLeaderboardManifest = {
  $schema?: string;
  leaderboards?: GRushLeaderboardManifestEntry[];
};

export type GRushSubmitResult = {
  accepted: boolean;
  updated: boolean;
  value: number;
  rank: number | null;
  verified: false;
};

export type GRushLeaderboardEntry = {
  rank: number;
  pseudoId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  value: number;
  metadata: JsonValue | null;
  submittedAt: string;
  isSelf: boolean;
};

export type GRushLeaderboardPage = {
  key: string;
  title: string;
  sort: "asc" | "desc";
  valueType: string;
  period: string;
  periodKey: string;
  verified: false;
  entries: GRushLeaderboardEntry[];
  total: number;
};

export type GRushPlayerState = {
  pseudoId: string;
  payload: JsonValue;
  revision: number;
  updatedAt: string;
};

/**
 * セーブの置き場所。`"local"` は、GameRush がプレイヤーのサインインを確かめられず、端末
 * （ブラウザの保存領域）に置いたことを表す。`fallback: "local"` を渡したときだけ現れる。
 */
export type GRushCloudSaveStorage = "cloud" | "local";

export type GRushCloudSave = {
  slot: string;
  payload: JsonValue;
  /** クラウドの版。1 から増える。端末のセーブは常に 0。 */
  revision: number;
  createdAt: string;
  updatedAt: string;
  storage: GRushCloudSaveStorage;
};

/**
 * `"local"` を渡すと、GameRush がサインインを確かめられないとき（クラウドなら `signInRequired`
 * になるとき）だけ、端末に読み書きする。ほかの失敗では切り替えない。端末のセーブはブラウザが
 * 消すことがある。`protocolVersion` 5 未満の GameRush では無視され、渡さないときと同じになる。
 */
export type GRushCloudSaveFallback = "local";

export type GRushCloudSaveOptions = { fallback?: GRushCloudSaveFallback };
export type GRushCloudSaveWriteOptions = GRushCloudSaveOptions & {
  /**
   * 前に読んだ `revision`。クラウドの版がこれと違えば `conflict` で書かない。`0` は「クラウドに
   * まだ無いときだけ書く」。端末への書き込みでは見ない（最後の書き込みが勝つ）。
   */
  baseRevision?: number;
};

export type GRushShareImage =
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | HTMLCanvasElement
  | string
  | { base64: string; mimeType: string }
  | "screen";

export type GRushShareOptions = { text?: string; image?: GRushShareImage };
export type GRushShareStatus = "opened" | "cancelled";
export type GRushShareResult = { status: GRushShareStatus };

export type GRushLocaleSource = "user" | "system" | "device" | (string & {});
export type GRushLocale = {
  locale: string;
  source: GRushLocaleSource;
  languages: string[];
};

/**
 * 分析イベントの custom field。3つまで。キーは英数字と `_` で 32 文字まで。値は1行のテキストで
 * 40 文字（コードポイント）まで。改行と制御文字は空白に直してから数え、直した結果が空の値は拒まれる。
 */
export type GRushAnalyticsFields = { [key: string]: string };
export type GRushAnalyticsOptions = { fields?: GRushAnalyticsFields };
export type GRushEconomyFlowType = "source" | "sink";
/** GameRush の標準の取引の種類。ほかの値（英数字と `._:-` で 32 文字まで）も受ける。 */
export type GRushEconomyTransactionType =
  | "TimedReward"
  | "Onboarding"
  | "Shop"
  | "Gameplay"
  | "ContextualPurchase"
  | (string & {});
export type GRushEconomyOptions = GRushAnalyticsOptions & {
  /** 品目。1行のテキストで 40 文字まで。 */
  itemSku?: string;
};

/** 確かめて作り直した分析イベント。`mock.analyticsEvents()` が返す。 */
export type GRushAnalyticsEvent =
  | { kind: "onboarding"; step: number; stepName?: string; fields?: GRushAnalyticsFields }
  | {
      kind: "funnel";
      funnel: string;
      funnelSessionId?: string;
      step: number;
      stepName?: string;
      fields?: GRushAnalyticsFields;
    }
  | { kind: "custom"; name: string; value: number; fields?: GRushAnalyticsFields }
  | {
      kind: "economy";
      flowType: GRushEconomyFlowType;
      currency: string;
      amount: number;
      endingBalance: number;
      transactionType: string;
      itemSku?: string;
      fields?: GRushAnalyticsFields;
    };

export type GRushPeer = {
  index: number;
  pseudoId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type GRushChannel = "reliable" | "unreliable";
export type GRushPayload = ArrayBuffer | ArrayBufferView | string;
export type GRushSendOptions = { channel?: GRushChannel; to?: number };

export type GRushMessage = {
  from: number;
  channel: GRushChannel;
  seq: number;
  payload: ArrayBuffer;
  isStale: boolean;
  text(): string;
  json(): unknown;
};

export type GRushRoomEvents = {
  message: GRushMessage;
  peerjoin: GRushPeer;
  peerleave: { index: number };
  host: { index: number };
  transportchange: { transport: string };
  close: { reason: string };
};

export interface GRushRoom {
  readonly roomId: string;
  readonly roomCode: string;
  readonly roomEpoch: number;
  readonly localPeerId: number;
  readonly peers: GRushPeer[];
  readonly hostPeerId: number;
  readonly transport: string;
  readonly isClosed: boolean;
  isHost(): boolean;
  serverTimeMs(): number;
  lastSeqFrom(peerId: number): number;
  on<K extends keyof GRushRoomEvents>(
    name: K,
    handler: (event: GRushRoomEvents[K]) => void,
  ): () => void;
  send(payload: GRushPayload, options?: GRushSendOptions): GRushResult<true>;
  sendJson(value: unknown, options?: GRushSendOptions): GRushResult<true>;
  leave(): Promise<GRushResult<true>>;
}

export type GRushMockConfig = {
  signedIn: boolean;
  displayName: string;
  avatarUrl: string | null;
  grantProfileConsent: boolean;
  confirmPlayerStateReport: boolean;
  unreliableDropRate: number;
  maxPeers: number;
  shareAvailable: boolean;
  shareStatus: GRushShareStatus;
  locale: string | null;
};

export interface GRushMockPeer {
  readonly index: number;
  readonly pseudoId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  on(name: "message", handler: (message: GRushMessage) => void): () => void;
  send(payload: GRushPayload, options?: GRushSendOptions): void;
}

export interface GRushMock {
  config: GRushMockConfig;
  defineLeaderboard(
    key: string,
    options?: Partial<Omit<GRushLeaderboardDefinition, "key">> & { enabled?: boolean },
  ): void;
  /**
   * `grush.json` の中身（オブジェクトか JSON の文字列）でモックの枠を宣言し、宣言した key を返す。
   * アップロードと同じ規則で読み、誤りは `invalidParams` で返す。同じ key を `defineLeaderboard` で
   * 宣言してあっても、こちらの定義で置き換える。これを呼ぶと、ページの隣の `grush.json` は自動では読まない。
   */
  loadLeaderboards(manifest: GRushLeaderboardManifest | string): GRushResult<string[]>;
  addRival(
    key: string,
    displayName: string,
    value: number,
    options?: { avatarUrl?: string | null; isGuest?: boolean },
  ): void;
  definePlayerState(pseudoId: string, payload: JsonValue, options?: { hidden?: boolean }): void;
  addPeer(displayName: string, avatarUrl?: string | null): GRushMockPeer | null;
  removePeer(peer: GRushMockPeer): void;
  /** モックが受けた分析イベントの写し。直近の 200 件を古い順に返す。`reset()` で空になる。 */
  analyticsEvents(): GRushAnalyticsEvent[];
  reset(): void;
}

export interface GRushSdk {
  readonly VERSION: string;
  readonly CODES: { readonly [K in GRushCode]: K };
  readonly CHANNEL_RELIABLE: "reliable";
  readonly CHANNEL_UNRELIABLE: "unreliable";
  readonly EVERYONE: -1;
  readonly MAX_MESSAGE_BYTES: number;
  readonly backend: GRushBackendKind;
  configure(settings: { backend?: GRushBackendSelection }): void;
  isAvailable(): boolean;
  protocolVersion(): number;
  player: {
    getSelf(): Promise<GRushResult<GRushPlayer>>;
    requestProfile(): Promise<GRushResult<GRushPlayer>>;
    revokeProfile(): Promise<GRushResult<GRushPlayer>>;
  };
  leaderboards: {
    list(): Promise<GRushResult<GRushLeaderboardDefinition[]>>;
    submit(
      key: string,
      value: number,
      options?: { metadata?: JsonValue; operationId?: string },
    ): Promise<GRushResult<GRushSubmitResult>>;
    top(
      key: string,
      options?: { limit?: number; offset?: number },
    ): Promise<GRushResult<GRushLeaderboardPage>>;
    aroundMe(key: string, options?: { range?: number }): Promise<GRushResult<GRushLeaderboardPage>>;
    friends(key: string, options?: { limit?: number }): Promise<GRushResult<GRushLeaderboardPage>>;
  };
  playerState: {
    getMine(): Promise<GRushResult<GRushPlayerState | null>>;
    setMine(
      payload: { [key: string]: JsonValue },
      baseRevision?: number,
    ): Promise<GRushResult<GRushPlayerState>>;
    get(pseudoIds: string[]): Promise<GRushResult<GRushPlayerState[]>>;
    report(pseudoId: string): Promise<GRushResult<boolean>>;
  };
  cloudSave: {
    /**
     * スロットのセーブを読む。無ければ `null`。`fallback: "local"` のとき、サインイン済みでクラウドに
     * 無ければ端末のセーブを返す。別のアカウントのものと分かっている端末のセーブは返さず、どのアカウントか
     * 分からないまま書いたものは返す。サインインを確かめられないときは、どのアカウントで書いたかに関係なく
     * 端末のセーブを返す。
     */
    load(
      slot?: string,
      options?: GRushCloudSaveOptions,
    ): Promise<GRushResult<GRushCloudSave | null>>;
    /**
     * スロットへ書く。`fallback: "local"` のとき、クラウドへ書けたら、同じスロットの、このプレイヤーの
     * 端末のセーブと、どのアカウントのものか分からない端末のセーブを消す。
     * サインイン後の書き込みが `conflict` になったら、`load` してから書き直す。
     */
    save(
      payload: JsonValue,
      slot?: string,
      options?: GRushCloudSaveWriteOptions,
    ): Promise<GRushResult<GRushCloudSave>>;
    /**
     * スロットを消す。`fallback: "local"` のとき、クラウドで消せたら、同じスロットの、このプレイヤーの
     * 端末のセーブと、どのアカウントのものか分からない端末のセーブも消す。サインインを確かめられない
     * ときは、どのアカウントで書いたかに関係なく端末のセーブを消す。
     */
    remove(slot?: string, options?: GRushCloudSaveOptions): Promise<GRushResult<true>>;
  };
  share: {
    share(options?: GRushShareOptions): Promise<GRushResult<GRushShareResult>>;
    isAvailable(): Promise<boolean>;
  };
  locale: {
    get(): Promise<GRushResult<GRushLocale>>;
    current(): GRushLocale | null;
    onChange(handler: (locale: GRushLocale) => void): () => void;
  };
  /**
   * 作者のアナリティクスへ送るイベント。ほかの API と違い、どれも同期で `boolean` を返し、例外を投げない。
   * `true` は GameRush へ渡したことで、保存されたことではない。形が不正なとき、`protocolVersion` 6 未満の
   * GameRush、GameRush の外では `false`。名前・値・field にプレイヤーを識別できる情報を入れない。
   *
   * `true` でも保存されないもの: 前面に出るまでに溜めた 30 件を超えた分（これは `false`）のほか、前面に出た後に
   * GameRush 本体が掛ける上限（500ms に1件、まとめて最大 30 件、送る前の列は合計 200 件）を超えた分、
   * セッションあたりの上限（オンボーディングを含むファネルのステップ 200 件・カスタムイベント 500 件・
   * エコノミー 500 件）を超えた分、送れなかった分。オンボーディングとファネルの同じステップは、1セッション
   * （ページを読み直しても続く）で最初の1回だけが残る。
   */
  analytics: {
    /** オンボーディングのステップ。`step` は 1〜100 の整数。 */
    logOnboardingStep(
      step: number,
      stepName?: string | null,
      options?: GRushAnalyticsOptions,
    ): boolean;
    /**
     * ファネルのステップ。`funnel` と `funnelSessionId` は英数字と `._:-` で 64 文字まで。同じファネルを
     * 1つのプレイで何度も通るなら、通るたびに別の `funnelSessionId` を渡す。
     */
    logFunnelStep(
      funnel: string,
      funnelSessionId: string | null | undefined,
      step: number,
      stepName?: string | null,
      options?: GRushAnalyticsOptions,
    ): boolean;
    /** カスタムイベント。`value` は省略で 1、絶対値 1e9 まで。 */
    logCustomEvent(name: string, value?: number, options?: GRushAnalyticsOptions): boolean;
    /**
     * 通貨の入手（`"source"`）と消費（`"sink"`）。`amount` は正の値、`endingBalance` はその後の残高で必須。
     * `currency` と `transactionType` は英数字と `._:-` で 32 文字まで。
     */
    logEconomyEvent(
      flowType: GRushEconomyFlowType,
      currency: string,
      amount: number,
      endingBalance: number,
      transactionType: GRushEconomyTransactionType,
      options?: GRushEconomyOptions,
    ): boolean;
    /** GameRush の中で動いていて、分析イベントを送れるか。 */
    isAvailable(): boolean;
  };
  net: {
    join(options?: { mode?: string; roomCode?: string }): Promise<GRushResult<GRushRoom>>;
    readonly room: GRushRoom | null;
  };
  mock: GRushMock;
}

export declare const VERSION: string;
export declare const CODES: GRushSdk["CODES"];
export declare function createGRush(options?: { backend?: GRushBackendSelection }): GRushSdk;
export declare const GRush: GRushSdk;
export default GRush;

declare global {
  interface Window {
    GRush: GRushSdk;
    GRushSdk: GRushSdk;
  }
}
