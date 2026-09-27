import { createHash, randomUUID } from "node:crypto";
import { NeonDashboardRepository, type DashboardSnapshot } from "../../data/server/neon-dashboard-repository";
import { createNeonExecutor, type SqlExecutor } from "../../data/server/neon-client";
import type { ContentItem, DashboardState, MediaAsset } from "../../domain/types";
import { createProviderMediaDeliveryUrls } from "../../media/server/media-delivery-url";
import { NeonLineConnectionRepository } from "./line-connection-repository";
import { buildLineMessages } from "./line-message-builder";
import { LinePushError, pushLineMessages } from "./line-push-client";

const LINE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MEDIA_URL_TTL_SECONDS = 3_600;
const DELIVERY_TIMEOUT_MS = 12_000;

export type LineDeliveryErrorCode =
  | "content_not_found"
  | "stale_content"
  | "caption_required"
  | "asset_not_ready"
  | "asset_unsupported"
  | "preview_missing"
  | "configuration"
  | "recipient"
  | "quota"
  | "media_fetch"
  | "timeout"
  | "provider";

export class LineDeliveryError extends Error {
  constructor(readonly code: LineDeliveryErrorCode) {
    super(code);
    this.name = "LineDeliveryError";
  }
}

export type DeliveryView = {
  id: string;
  status: "sent" | "failed";
  errorCategory: LineDeliveryErrorCode | null;
  sentAt: string | null;
};

type DeliveryRow = {
  id: unknown;
  status: unknown;
  sent_at: unknown;
  error_category: unknown;
  created_at: unknown;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Environment = Readonly<Record<string, string | undefined>>;

type DeliveryServiceOptions = {
  loadDashboardSnapshot?: () => Promise<DashboardSnapshot>;
  getActiveRecipient?: () => Promise<string | null>;
  execute?: SqlExecutor;
  fetcher?: Fetcher;
  environment?: Environment;
  now?: () => number;
  generateId?: () => string;
  timeoutMs?: number;
};

function idempotencyKey(content: ContentItem, asset: MediaAsset): string {
  const captionDigest = createHash("sha256").update(content.caption, "utf8").digest("hex");
  return createHash("sha256")
    .update([content.id, content.updatedAt, asset.id, captionDigest].join("\n"), "utf8")
    .digest("hex");
}

function deliveryErrorCategory(value: unknown): LineDeliveryErrorCode | null {
  return value === "configuration" || value === "recipient" || value === "quota"
    || value === "media_fetch" || value === "timeout" || value === "provider"
    ? value
    : null;
}

function deliveryView(row: DeliveryRow): DeliveryView {
  return {
    id: String(row.id),
    status: row.status === "sent" ? "sent" : "failed",
    errorCategory: deliveryErrorCategory(row.error_category),
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
  };
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function findContentAndAsset(state: DashboardState, contentId: string, expectedUpdatedAt: string): [ContentItem, MediaAsset] {
  const content = state.contents.find((item) => item.id === contentId && !item.deletedAt);
  if (!content) throw new LineDeliveryError("content_not_found");
  if (content.updatedAt !== expectedUpdatedAt) throw new LineDeliveryError("stale_content");
  if (!content.caption.trim()) throw new LineDeliveryError("caption_required");

  const mediaById = new Map(state.media.map((asset) => [asset.id, asset]));
  const asset = content.assetIds
    .map((assetId) => mediaById.get(assetId))
    .find((candidate) => candidate && !candidate.deletedAt && candidate.remoteStatus === "ready");
  if (!asset || (!asset.providerFileId && !(asset.source === "external" && safeExternalUrl(asset.externalUrl)))) {
    throw new LineDeliveryError("asset_not_ready");
  }
  if (asset.mimeType !== "image/jpeg" && asset.mimeType !== "image/png" && asset.mimeType !== "video/mp4") {
    throw new LineDeliveryError("asset_unsupported");
  }
  if (asset.mimeType === "video/mp4" && !asset.previewProviderFileId
    && !(asset.source === "external" && safeExternalUrl(asset.externalPreviewUrl))) {
    throw new LineDeliveryError("preview_missing");
  }
  return [content, asset];
}

export class LineDeliveryService {
  private readonly loadDashboardSnapshot: () => Promise<DashboardSnapshot>;
  private readonly getActiveRecipient: () => Promise<string | null>;
  private readonly execute: SqlExecutor;
  private readonly fetcher: Fetcher;
  private readonly environment: Environment;
  private readonly now: () => number;
  private readonly generateId: () => string;
  private readonly timeoutMs: number;

  constructor(options: DeliveryServiceOptions = {}) {
    this.loadDashboardSnapshot = options.loadDashboardSnapshot ?? (() => new NeonDashboardRepository().loadDashboardState());
    this.getActiveRecipient = options.getActiveRecipient ?? (() => new NeonLineConnectionRepository().getActiveRecipient());
    this.execute = options.execute ?? createNeonExecutor();
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.environment = options.environment ?? process.env;
    this.now = options.now ?? Date.now;
    this.generateId = options.generateId ?? randomUUID;
    this.timeoutMs = options.timeoutMs ?? DELIVERY_TIMEOUT_MS;
  }

  async sendContentToLine({ contentId, expectedUpdatedAt, actorId: _actorId }: {
    contentId: string;
    expectedUpdatedAt: string;
    actorId: string;
  }): Promise<DeliveryView> {
    const snapshot = await this.loadDashboardSnapshot();
    const [content, asset] = findContentAndAsset(snapshot.state, contentId, expectedUpdatedAt);
    const key = idempotencyKey(content, asset);
    const rows = await this.execute(
      `INSERT INTO line_deliveries (
         id, idempotency_key, content_id, content_revision, asset_id, caption_snapshot,
         status, attempt_count, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'queued', 1, now(), now())
       ON CONFLICT (idempotency_key) DO UPDATE SET
         status = CASE WHEN line_deliveries.status = 'sent' THEN 'sent' ELSE 'queued' END,
         attempt_count = CASE WHEN line_deliveries.status = 'sent' THEN line_deliveries.attempt_count ELSE line_deliveries.attempt_count + 1 END,
         error_category = CASE WHEN line_deliveries.status = 'sent' THEN line_deliveries.error_category ELSE NULL END,
         updated_at = now()
       RETURNING id, status, sent_at, error_category, created_at`,
      [this.generateId(), key, content.id, content.updatedAt, asset.id, content.caption],
    );
    const delivery = rows[0] as DeliveryRow | undefined;
    if (!delivery) throw new Error("LINE delivery could not be persisted");
    if (delivery.status === "sent") return deliveryView(delivery);

    const createdAt = Date.parse(String(delivery.created_at));
    const retryAge = this.now() - createdAt;
    // Retries must keep the exact request body so LINE can safely deduplicate its UUID key.
    // Signed media URLs stay identical and valid for one hour; the provider's retry-key window is 24 hours.
    if (!Number.isFinite(createdAt) || retryAge >= Math.min(LINE_RETRY_WINDOW_MS, MEDIA_URL_TTL_SECONDS * 1_000)) {
      await this.recordFailure(delivery.id, "timeout");
      return { id: String(delivery.id), status: "failed", errorCategory: "timeout", sentAt: null };
    }

    const recipient = await this.getActiveRecipient();
    if (!recipient) {
      await this.recordFailure(delivery.id, "recipient");
      return { id: String(delivery.id), status: "failed", errorCategory: "recipient", sentAt: null };
    }

    const accessToken = this.environment.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      await this.recordFailure(delivery.id, "configuration");
      return { id: String(delivery.id), status: "failed", errorCategory: "configuration", sentAt: null };
    }

    try {
      let signedUrls: ReturnType<typeof createProviderMediaDeliveryUrls>;
      if (asset.source === "external") {
        const original = safeExternalUrl(asset.externalUrl);
        const preview = asset.mimeType === "video/mp4" ? safeExternalUrl(asset.externalPreviewUrl) : original;
        if (!original || !preview) throw new LineDeliveryError("asset_not_ready");
        signedUrls = { originalContentUrl: original, previewImageUrl: preview };
      } else {
        const previewProviderFileId = asset.mimeType === "video/mp4" ? asset.previewProviderFileId! : asset.providerFileId!;
        try {
          signedUrls = createProviderMediaDeliveryUrls({
            providerFileId: asset.providerFileId!,
            previewProviderFileId,
            environment: this.environment,
            now: () => Math.floor(createdAt / 1_000),
            ttlSeconds: MEDIA_URL_TTL_SECONDS,
          });
        } catch {
          throw new LineDeliveryError("configuration");
        }
      }
      const messages = buildLineMessages({
        media: asset.mimeType === "video/mp4"
          ? { kind: "video", originalUrl: signedUrls.originalContentUrl, previewUrl: signedUrls.previewImageUrl }
          : { kind: "image", originalUrl: signedUrls.originalContentUrl, previewUrl: signedUrls.previewImageUrl },
        caption: content.caption,
      });
      await pushLineMessages({
        fetcher: this.fetcher,
        accessToken,
        recipientUserId: recipient,
        retryKey: String(delivery.id),
        messages,
        timeoutMs: this.timeoutMs,
      });
      const sent = await this.recordSent(delivery.id);
      return deliveryView((sent[0] ?? { ...delivery, status: "sent", sent_at: new Date(this.now()).toISOString() }) as DeliveryRow);
    } catch (error) {
      const category = error instanceof LineDeliveryError || error instanceof LinePushError
        ? error instanceof LineDeliveryError ? error.code : error.category
        : error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "provider";
      await this.recordFailure(delivery.id, category);
      return { id: String(delivery.id), status: "failed", errorCategory: category, sentAt: null };
    }
  }

  private recordSent(id: unknown): Promise<DeliveryRow[]> {
    return this.execute(
      `UPDATE line_deliveries SET status = 'sent', sent_at = now(), error_category = NULL, updated_at = now()
       WHERE id = $1 AND status <> 'sent'
       RETURNING id, status, sent_at, error_category, created_at`,
      [id],
    ) as Promise<DeliveryRow[]>;
  }

  private recordFailure(id: unknown, category: LineDeliveryErrorCode): Promise<DeliveryRow[]> {
    return this.execute(
      `UPDATE line_deliveries SET status = 'failed', error_category = $2, updated_at = now()
       WHERE id = $1 AND status <> 'sent'
       RETURNING id, status, sent_at, error_category, created_at`,
      [id, category],
    ) as Promise<DeliveryRow[]>;
  }
}
