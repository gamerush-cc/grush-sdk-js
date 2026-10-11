// The checks GameRush applies to an analytics event, copied for the mock so the editor rejects the same
// events GameRush does. Inside GameRush the injected runtime checks the event again; this copy never
// runs there. Each event is checked in the same order as GameRush and the first failure is the reason.

export const ANALYTICS_EVENT_KINDS = ["onboarding", "funnel", "custom", "economy"];
export const ANALYTICS_ECONOMY_FLOWS = ["source", "sink"];
export const ANALYTICS_STANDARD_TRANSACTION_TYPES = [
  "TimedReward",
  "Onboarding",
  "Shop",
  "Gameplay",
  "ContextualPurchase",
];
export const ANALYTICS_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
export const ANALYTICS_SHORT_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,32}$/;
export const ANALYTICS_FIELD_KEY_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
export const ANALYTICS_MAX_FIELDS = 3;
export const ANALYTICS_MAX_TEXT_CODE_POINTS = 40;
export const ANALYTICS_MIN_STEP = 1;
export const ANALYTICS_MAX_STEP = 100;
export const ANALYTICS_DEFAULT_CUSTOM_VALUE = 1;
export const ANALYTICS_MAX_ABS_CUSTOM_VALUE = 1e9;
export const ANALYTICS_MAX_AMOUNT = 1e12;
export const ANALYTICS_MAX_ABS_ENDING_BALANCE = 1e15;

// Control characters, line and paragraph separators and bidi overrides/isolates become one space.
const LINE_BREAKING_OR_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\u202A-\u202E\u2066-\u2069]+/gu;
// Text made only of characters that draw nothing counts as empty.
const VISIBLY_BLANK =
  /^[\s\p{Z}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u115F\u1160\u3164\uFFA0\u2800]*$/u;
const LONE_SURROGATE = /\p{Cs}/u;

function reject(reason) {
  return { ok: false, reason };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKey(value, pattern) {
  return typeof value === "string" && pattern.test(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// One line of text: null when it is not a string, too long or holds a lone surrogate; "" when blank.
function lineText(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(LINE_BREAKING_OR_CONTROL, " ").trim();
  if (LONE_SURROGATE.test(text)) return null;
  if ([...text].length > ANALYTICS_MAX_TEXT_CODE_POINTS) return null;
  return VISIBLY_BLANK.test(text) ? "" : text;
}

function optionalText(value) {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  const text = lineText(value);
  if (text === null) return reject("text");
  return { ok: true, value: text === "" ? undefined : text };
}

function sanitizeFields(value) {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!isRecord(value)) return reject("fields");
  const entries = Object.entries(value);
  if (entries.length > ANALYTICS_MAX_FIELDS) return reject("fields");
  const normalized = [];
  for (const [key, raw] of entries) {
    const text = lineText(raw);
    if (!ANALYTICS_FIELD_KEY_PATTERN.test(key) || !text) return reject("fields");
    normalized.push([key, text]);
  }
  if (normalized.length === 0) return { ok: true, value: undefined };
  return { ok: true, value: Object.fromEntries(normalized) };
}

function isStep(value) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= ANALYTICS_MIN_STEP &&
    value <= ANALYTICS_MAX_STEP
  );
}

function sanitizeStep(data, fields) {
  if (!isStep(data.step)) return reject("step");
  const stepName = optionalText(data.stepName);
  if (!stepName.ok) return stepName;
  let event;
  if (data.kind === "onboarding") {
    event = { kind: "onboarding", step: data.step };
  } else {
    if (!isKey(data.funnel, ANALYTICS_KEY_PATTERN)) return reject("name");
    event = { kind: "funnel", funnel: data.funnel, step: data.step };
    const funnelSessionId = data.funnelSessionId;
    if (funnelSessionId !== undefined && funnelSessionId !== null && funnelSessionId !== "") {
      if (!isKey(funnelSessionId, ANALYTICS_KEY_PATTERN)) return reject("name");
      event.funnelSessionId = funnelSessionId;
    }
  }
  if (stepName.value !== undefined) event.stepName = stepName.value;
  if (fields !== undefined) event.fields = fields;
  return { ok: true, event };
}

function sanitizeCustom(data, fields) {
  if (!isKey(data.name, ANALYTICS_KEY_PATTERN)) return reject("name");
  const value = data.value === undefined ? ANALYTICS_DEFAULT_CUSTOM_VALUE : data.value;
  if (!isFiniteNumber(value) || Math.abs(value) > ANALYTICS_MAX_ABS_CUSTOM_VALUE) {
    return reject("value");
  }
  const event = { kind: "custom", name: data.name, value };
  if (fields !== undefined) event.fields = fields;
  return { ok: true, event };
}

function sanitizeEconomy(data, fields) {
  const { flowType, currency, amount, endingBalance, transactionType } = data;
  if (!ANALYTICS_ECONOMY_FLOWS.includes(flowType)) return reject("flowType");
  if (!isKey(currency, ANALYTICS_SHORT_KEY_PATTERN)) return reject("currency");
  if (!isFiniteNumber(amount) || amount <= 0 || amount > ANALYTICS_MAX_AMOUNT) {
    return reject("amount");
  }
  if (
    !isFiniteNumber(endingBalance) ||
    Math.abs(endingBalance) > ANALYTICS_MAX_ABS_ENDING_BALANCE
  ) {
    return reject("endingBalance");
  }
  if (!isKey(transactionType, ANALYTICS_SHORT_KEY_PATTERN)) return reject("transactionType");
  const itemSku = optionalText(data.itemSku);
  if (!itemSku.ok) return itemSku;
  const event = { kind: "economy", flowType, currency, amount, endingBalance, transactionType };
  if (itemSku.value !== undefined) event.itemSku = itemSku.value;
  if (fields !== undefined) event.fields = fields;
  return { ok: true, event };
}

// Returns { ok: true, event } with only the known fields, or { ok: false, reason }.
export function sanitizeAnalyticsEvent(raw) {
  if (!isRecord(raw)) return reject("shape");
  if (!ANALYTICS_EVENT_KINDS.includes(raw.kind)) return reject("kind");
  const fields = sanitizeFields(raw.fields);
  if (!fields.ok) return fields;
  if (raw.kind === "onboarding" || raw.kind === "funnel") return sanitizeStep(raw, fields.value);
  if (raw.kind === "custom") return sanitizeCustom(raw, fields.value);
  return sanitizeEconomy(raw, fields.value);
}
