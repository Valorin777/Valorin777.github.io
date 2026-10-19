/** Upper bound for audio coming back from a model; 300 characters of speech is far below it. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const BASE64_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

/** Accepts plain or data-URL base64 (with or without whitespace); null when it is not base64. */
export function base64ToBytes(text: string): Uint8Array | null {
  const body = text.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (body.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function readStreamCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk: Uint8Array = value;
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { getReader?: unknown }).getReader === "function"
  );
}

/**
 * Normalizes what a Workers AI audio model returns into bytes: a ReadableStream, ArrayBuffer,
 * typed array, Response, base64 string, or an object with base64 `audio` (MeloTTS).
 * Null when there is nothing usable.
 */
export async function audioBytes(output: unknown, maxBytes: number = MAX_AUDIO_BYTES): Promise<Uint8Array | null> {
  let bytes: Uint8Array | null = null;
  if (output instanceof Uint8Array) bytes = output;
  else if (output instanceof ArrayBuffer) bytes = new Uint8Array(output);
  else if (ArrayBuffer.isView(output)) bytes = new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
  else if (output instanceof Response) bytes = output.body ? await readStreamCapped(output.body, maxBytes) : null;
  else if (isReadableStream(output)) bytes = await readStreamCapped(output, maxBytes);
  else if (typeof output === "string") bytes = base64ToBytes(output);
  else if (output !== null && typeof output === "object") {
    const audio = (output as { audio?: unknown }).audio;
    if (typeof audio === "string") bytes = base64ToBytes(audio);
  }
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  return bytes;
}

export type AudioType = "audio/mpeg" | "audio/wav" | "audio/ogg";

function startsWith(bytes: Uint8Array, ascii: string, offset = 0): boolean {
  if (bytes.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/** Sniffs the container so a JSON error body is never served as audio. */
export function sniffAudioType(bytes: Uint8Array): AudioType | null {
  if (startsWith(bytes, "ID3")) return "audio/mpeg";
  const first = bytes[0];
  const second = bytes[1];
  if (first === 0xff && second !== undefined && (second & 0xe0) === 0xe0) return "audio/mpeg";
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WAVE", 8)) return "audio/wav";
  if (startsWith(bytes, "OggS")) return "audio/ogg";
  return null;
}
