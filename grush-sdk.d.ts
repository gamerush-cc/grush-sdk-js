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
    options?: Partial<Omit<GRushLeaderboardDefinition, "key" | "period">>,
  ): void;
  addRival(
    key: string,
    displayName: string,
    value: number,
    options?: { avatarUrl?: string | null; isGuest?: boolean },
  ): void;
  definePlayerState(pseudoId: string, payload: JsonValue, options?: { hidden?: boolean }): void;
  addPeer(displayName: string, avatarUrl?: string | null): GRushMockPeer | null;
  removePeer(peer: GRushMockPeer): void;
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
     * 分からないまま書いたものは返す。
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
     * ときは端末のセーブを消す。
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
