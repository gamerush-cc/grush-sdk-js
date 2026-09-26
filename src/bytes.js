export const MAX_MESSAGE_BYTES = 8 * 1024;

export function toBytes(payload) {
  if (payload instanceof ArrayBuffer) return payload.slice(0);
  if (ArrayBuffer.isView(payload)) {
    return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
  }
  if (typeof payload === "string") return new TextEncoder().encode(payload).buffer;
  return null;
}

export function decodeText(buffer) {
  if (!(buffer instanceof ArrayBuffer)) return "";
  return new TextDecoder().decode(buffer);
}

export function decodeJson(buffer) {
  try {
    return JSON.parse(decodeText(buffer));
  } catch {
    return undefined;
  }
}
