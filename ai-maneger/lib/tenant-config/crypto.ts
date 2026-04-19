import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function getCipherKey() {
  const secret = process.env.APP_CONFIG_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("APP_CONFIG_ENCRYPTION_KEY が未設定です");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const key = getCipherKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [ivBase64, tagBase64, dataBase64] = payload.split(":");
  if (!ivBase64 || !tagBase64 || !dataBase64) {
    throw new Error("暗号化データ形式が不正です");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(tagBase64, "base64");
  const encrypted = Buffer.from(dataBase64, "base64");
  const key = getCipherKey();

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString("utf8");
}
