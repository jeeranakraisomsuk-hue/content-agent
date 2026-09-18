import { createHmac, timingSafeEqual } from "node:crypto";

export type MediaDeliveryPurpose = "original" | "preview";

type MediaDeliveryFields = {
  fileId: string;
  purpose: MediaDeliveryPurpose;
  expiresAt: number;
};

function signaturePayload({ fileId, purpose, expiresAt }: MediaDeliveryFields): string {
  return `${fileId}\n${purpose}\n${expiresAt}`;
}

function signMediaDelivery(fields: MediaDeliveryFields, secret: string): string {
  return createHmac("sha256", secret).update(signaturePayload(fields)).digest("base64url");
}

export function createMediaDeliveryUrl({
  baseUrl,
  secret,
  ...fields
}: MediaDeliveryFields & { baseUrl: string; secret: string }): string {
  if (!secret) throw new Error("Media signing secret is required");
  const url = new URL(`/api/media/provider/${encodeURIComponent(fields.fileId)}`, baseUrl);
  url.searchParams.set("purpose", fields.purpose);
  url.searchParams.set("expiresAt", String(fields.expiresAt));
  url.searchParams.set("signature", signMediaDelivery(fields, secret));
  return url.toString();
}

export function verifyMediaDeliveryUrl({
  url,
  expectedFileId,
  secret,
  now,
}: {
  url: string;
  expectedFileId: string;
  secret: string;
  now: number;
}): boolean {
  if (!secret) return false;
  const parsed = new URL(url);
  const purpose = parsed.searchParams.get("purpose");
  const expiresValue = parsed.searchParams.get("expiresAt");
  const receivedSignature = parsed.searchParams.get("signature");
  if (purpose !== "original" && purpose !== "preview") return false;
  if (!expiresValue || !receivedSignature) return false;

  const expiresAt = Number(expiresValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const expectedSignature = signMediaDelivery({ fileId: expectedFileId, purpose, expiresAt }, secret);
  const receivedBytes = Buffer.from(receivedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
