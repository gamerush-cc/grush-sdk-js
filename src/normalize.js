const text = (value, fallback = "") => (typeof value === "string" ? value : fallback);
const number = (value, fallback = 0) => (typeof value === "number" ? value : fallback);
const nullableText = (value) => (typeof value === "string" ? value : null);

export function playerOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw;
  const consent = source.profileConsent === true;
  const profile =
    consent && source.profile && typeof source.profile === "object" ? source.profile : {};
  return {
    pseudoId: text(source.pseudoId),
    isGuest: source.isGuest !== false,
    profileConsent: consent,
    displayName: nullableText(profile.displayName),
    avatarUrl: nullableText(profile.avatarUrl),
  };
}

export function peerOf(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    index: number(source.index, -1),
    pseudoId: text(source.pseudoId),
    displayName: nullableText(source.displayName),
    avatarUrl: nullableText(source.avatarUrl),
  };
}

export function leaderboardDefinitionOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw;
  return {
    key: text(source.key),
    title: text(source.title),
    sort: source.sort === "asc" ? "asc" : "desc",
    valueType: text(source.valueType, "int"),
    aggregation: text(source.aggregation, "best"),
    period: text(source.period, "all_time"),
    minValue: typeof source.minValue === "number" ? source.minValue : null,
    maxValue: typeof source.maxValue === "number" ? source.maxValue : null,
  };
}

export function submitResultOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    accepted: raw.accepted === true,
    updated: raw.updated === true,
    value: number(raw.value),
    rank: typeof raw.rank === "number" ? raw.rank : null,
    verified: false,
  };
}

function entryOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw;
  return {
    rank: number(source.rank),
    pseudoId: text(source.pseudoId),
    displayName: nullableText(source.displayName),
    avatarUrl: nullableText(source.avatarUrl),
    isGuest: source.isGuest !== false,
    value: number(source.value),
    metadata: source.metadata ?? null,
    submittedAt: text(source.submittedAt),
    isSelf: source.isSelf === true,
  };
}

export function leaderboardPageOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    key: text(raw.key),
    title: text(raw.title),
    sort: raw.sort === "asc" ? "asc" : "desc",
    valueType: text(raw.valueType, "int"),
    period: text(raw.period, "all_time"),
    periodKey: text(raw.periodKey),
    verified: false,
    entries: Array.isArray(raw.entries)
      ? raw.entries.map(entryOf).filter((entry) => entry !== null)
      : [],
    total: number(raw.total),
  };
}

export function playerStateOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    pseudoId: text(raw.pseudoId),
    payload: raw.payload ?? {},
    revision: number(raw.revision),
    updatedAt: text(raw.updatedAt),
  };
}

export function cloudSaveOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    slot: text(raw.slot, "default"),
    payload: raw.payload ?? null,
    revision: number(raw.revision),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
    storage: raw.storage === "local" ? "local" : "cloud",
  };
}

export function shareResultOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  return { status: raw.status === "opened" ? "opened" : "cancelled" };
}

export function localeOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.locale !== "string" || !raw.locale) return null;
  const languages = Array.isArray(raw.languages)
    ? raw.languages.filter((tag) => typeof tag === "string" && tag)
    : [];
  return {
    locale: raw.locale,
    source: typeof raw.source === "string" && raw.source ? raw.source : "device",
    languages: languages.length ? languages : [raw.locale],
  };
}
