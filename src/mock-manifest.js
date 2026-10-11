// Reads grush.json for the mock with the same rules GameRush applies on upload, so a mistake shows up
// while testing locally instead of failing the upload. The messages match the ones the upload shows.
export const MANIFEST_PATH = "grush.json";

const MAX_BYTES = 64 * 1024;
const MAX_LEADERBOARDS = 20;
const MAX_TITLE_LENGTH = 60;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const LINE_BREAKING_OR_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\u202A-\u202E\u2066-\u2069]+/gu;
const TOP_LEVEL_FIELDS = new Set(["$schema", "leaderboards"]);
const ENTRY_FIELDS = new Set([
  "key",
  "title",
  "sort",
  "valueType",
  "aggregation",
  "period",
  "minValue",
  "maxValue",
  "enabled",
]);
const CHOICES = {
  sort: ["desc", "asc"],
  valueType: ["int", "float", "duration_ms"],
  aggregation: ["best", "last", "sum"],
  period: ["all_time", "daily", "weekly", "monthly"],
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidField(field) {
  return { ok: false, error: `${MANIFEST_PATH} has an invalid value: ${field}` };
}

function readSource(source) {
  if (typeof source !== "string") return { ok: true, value: source };
  if (new TextEncoder().encode(source).byteLength > MAX_BYTES) {
    return { ok: false, error: `${MANIFEST_PATH} is too large (${MAX_BYTES / 1024}KB at most).` };
  }
  try {
    return { ok: true, value: JSON.parse(source.replace(/^\uFEFF/, "")) };
  } catch {
    return { ok: false, error: `${MANIFEST_PATH} can't be read as a JSON object.` };
  }
}

function readEntry(item, at) {
  if (!isPlainObject(item)) return invalidField(at);
  for (const field of Object.keys(item)) {
    if (!ENTRY_FIELDS.has(field)) {
      return { ok: false, error: `${MANIFEST_PATH} has an unknown field: ${at}.${field}` };
    }
  }
  if (typeof item.key !== "string" || !KEY_PATTERN.test(item.key)) return invalidField(`${at}.key`);
  const title =
    typeof item.title === "string" ? item.title.replace(LINE_BREAKING_OR_CONTROL, " ").trim() : "";
  if (title.length < 1 || title.length > MAX_TITLE_LENGTH) return invalidField(`${at}.title`);
  for (const [field, choices] of Object.entries(CHOICES)) {
    if (!choices.includes(item[field])) return invalidField(`${at}.${field}`);
  }
  if (item.enabled !== undefined && typeof item.enabled !== "boolean") {
    return invalidField(`${at}.enabled`);
  }
  for (const field of ["minValue", "maxValue"]) {
    const value = item[field];
    if (value !== undefined && value !== null && !Number.isFinite(value)) {
      return invalidField(`${at}.${field}`);
    }
  }
  const minValue = item.minValue ?? null;
  const maxValue = item.maxValue ?? null;
  if ((minValue === null) !== (maxValue === null) || (minValue !== null && minValue >= maxValue)) {
    return invalidField(`${at}.minValue / maxValue`);
  }
  return {
    ok: true,
    entry: {
      key: item.key,
      title,
      sort: item.sort,
      valueType: item.valueType,
      aggregation: item.aggregation,
      period: item.period,
      minValue,
      maxValue,
      enabled: item.enabled !== false,
    },
  };
}

// source is the file's text or the already parsed object. Returns { ok: true, leaderboards } or
// { ok: false, error }.
export function parseLeaderboardManifest(source) {
  const read = readSource(source);
  if (!read.ok) return read;
  const parsed = read.value;
  if (!isPlainObject(parsed)) {
    return { ok: false, error: `${MANIFEST_PATH} can't be read as a JSON object.` };
  }
  for (const field of Object.keys(parsed)) {
    if (!TOP_LEVEL_FIELDS.has(field)) {
      return { ok: false, error: `${MANIFEST_PATH} has an unknown field: ${field}` };
    }
  }
  const list = parsed.leaderboards ?? [];
  if (!Array.isArray(list)) return invalidField("leaderboards");
  if (list.length > MAX_LEADERBOARDS) {
    return {
      ok: false,
      error: `${MANIFEST_PATH} can declare up to ${MAX_LEADERBOARDS} leaderboards.`,
    };
  }
  const leaderboards = [];
  const seen = new Set();
  for (const [index, item] of list.entries()) {
    const read = readEntry(item, `leaderboards[${index}]`);
    if (!read.ok) return read;
    if (seen.has(read.entry.key)) {
      return {
        ok: false,
        error: `${MANIFEST_PATH} declares the leaderboard key more than once: ${read.entry.key}`,
      };
    }
    seen.add(read.entry.key);
    leaderboards.push(read.entry);
  }
  return { ok: true, leaderboards };
}
