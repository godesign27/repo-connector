import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const AES_ALGO = "aes-256-gcm";

export function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(AES_ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string, secret: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted payload");
  }
  const key = deriveKey(secret);
  const decipher = createDecipheriv(
    AES_ALGO,
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function signState(secret: string, clientId: string): string {
  const body = Buffer.from(clientId, "utf8").toString("base64url");
  const sig = hmacHex(secret, `state:${clientId}`);
  return `${body}.${sig}`;
}

export function verifyState(secret: string, state: string): string | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) {
    return null;
  }
  let clientId: string;
  try {
    clientId = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = hmacHex(secret, `state:${clientId}`);
  if (!safeEqualHex(sig, expected)) {
    return null;
  }
  return clientId;
}
