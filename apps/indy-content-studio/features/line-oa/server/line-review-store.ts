import { createNeonExecutor, type SqlExecutor } from "../../data/server/neon-client";
import type { LineReviewEvent } from "../review-model";
import { decryptLineUserId, encryptLineUserId } from "./line-user-encryption";

export interface StoredLineReview {
  contentId: string;
  cycleId: string;
  reviewCode: string;
  recipientUserId: string;
  events: Array<{ id: string; event: LineReviewEvent; comment: string | null; occurredAt: string; providerReceipt?: string }>;
  handledWebhookEventIds: string[];
}

type ReviewEventInput = StoredLineReview["events"][number];
type ReviewQueryRow = Record<string, unknown> & {
  review_code: unknown;
  content_id: unknown;
  cycle_id: unknown;
  encrypted_recipient_user_id: unknown;
};

type StoreOptions = { execute?: SqlExecutor; encryptionKey?: string };

function eventTime(value: unknown): string {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error("Invalid LINE review event time");
  return parsed.toISOString();
}

function hydrateReview(rows: ReviewQueryRow[], encryptionKey: string): StoredLineReview | null {
  const first = rows[0];
  if (!first) return null;
  if (typeof first.encrypted_recipient_user_id !== "string") throw new Error("Invalid stored LINE review recipient");
  const events = rows
    .filter((row) => typeof row.event_id === "string")
    .map((row) => ({
      id: String(row.event_id),
      event: row.event as LineReviewEvent,
      comment: typeof row.comment === "string" ? row.comment : null,
      occurredAt: eventTime(row.occurred_at),
      ...(typeof row.provider_receipt === "string" ? { providerReceipt: row.provider_receipt } : {}),
    }));
  return {
    contentId: String(first.content_id),
    cycleId: String(first.cycle_id),
    reviewCode: String(first.review_code),
    recipientUserId: decryptLineUserId(first.encrypted_recipient_user_id, encryptionKey),
    events,
    handledWebhookEventIds: [...new Set(rows.flatMap((row) => typeof row.webhook_event_id === "string" ? [row.webhook_event_id] : []))],
  };
}

const reviewSelect = `SELECT r.review_code, r.content_id, r.cycle_id, r.encrypted_recipient_user_id,
       e.id AS event_id, e.event, e.comment, e.occurred_at, e.provider_receipt, e.webhook_event_id
       FROM line_reviews r LEFT JOIN line_review_events e ON e.review_code = r.review_code`;

export class NeonLineReviewStore {
  private readonly execute: SqlExecutor;
  private readonly encryptionKey: string;

  constructor(options: StoreOptions = {}) {
    this.execute = options.execute ?? createNeonExecutor();
    this.encryptionKey = options.encryptionKey ?? process.env.LINE_RECIPIENT_ENCRYPTION_KEY ?? "";
  }

  async registerLineReview(review: Omit<StoredLineReview, "events" | "handledWebhookEventIds">): Promise<StoredLineReview> {
    const encryptedRecipient = encryptLineUserId(review.recipientUserId, this.encryptionKey);
    await this.execute(
      `INSERT INTO line_reviews (review_code, content_id, cycle_id, encrypted_recipient_user_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT (review_code) DO NOTHING`,
      [review.reviewCode, review.contentId, review.cycleId, encryptedRecipient],
    );
    const stored = await this.getLineReview(review.reviewCode);
    if (!stored) throw new Error("LINE review could not be persisted");
    return stored;
  }

  async getLineReview(reviewCode: string): Promise<StoredLineReview | null> {
    const rows = await this.execute(
      `${reviewSelect} WHERE r.review_code = $1 ORDER BY e.occurred_at, e.id`,
      [reviewCode],
    );
    return hydrateReview(rows as ReviewQueryRow[], this.encryptionKey);
  }

  async appendLineReviewEvent(
    reviewCode: string,
    event: ReviewEventInput,
    webhookEventId?: string,
  ): Promise<StoredLineReview | null> {
    await this.execute(
      `WITH accepted_webhook_event AS (
         INSERT INTO line_webhook_events (webhook_event_id)
         SELECT $7 WHERE $7::text IS NOT NULL
         ON CONFLICT (webhook_event_id) DO NOTHING
         RETURNING webhook_event_id
       ), inserted_review_event AS (
         INSERT INTO line_review_events (id, review_code, event, comment, occurred_at, provider_receipt, webhook_event_id)
         SELECT $1, $2, $3, $4, $5::timestamptz, $6, $7
         WHERE EXISTS (SELECT 1 FROM line_reviews WHERE review_code = $2)
           AND ($7::text IS NULL OR EXISTS (SELECT 1 FROM accepted_webhook_event))
         ON CONFLICT DO NOTHING
         RETURNING id
       )
       SELECT id FROM inserted_review_event`,
      [event.id, reviewCode, event.event, event.comment, event.occurredAt, event.providerReceipt ?? null, webhookEventId ?? null],
    );
    return this.getLineReview(reviewCode);
  }

  async listLineReviews(): Promise<StoredLineReview[]> {
    const rows = await this.execute(`${reviewSelect} ORDER BY r.created_at, e.occurred_at, e.id`, []);
    const grouped = new Map<string, ReviewQueryRow[]>();
    for (const row of rows as ReviewQueryRow[]) {
      const code = String(row.review_code);
      const group = grouped.get(code) ?? [];
      group.push(row);
      grouped.set(code, group);
    }
    return [...grouped.values()]
      .map((group) => hydrateReview(group, this.encryptionKey))
      .filter((review): review is StoredLineReview => review !== null);
  }
}

function defaultStore(): NeonLineReviewStore {
  return new NeonLineReviewStore();
}

export function registerLineReview(review: Omit<StoredLineReview, "events" | "handledWebhookEventIds">): Promise<StoredLineReview> {
  return defaultStore().registerLineReview(review);
}

export function getLineReview(reviewCode: string): Promise<StoredLineReview | null> {
  return defaultStore().getLineReview(reviewCode);
}

export function appendLineReviewEvent(reviewCode: string, event: ReviewEventInput, webhookEventId?: string): Promise<StoredLineReview | null> {
  return defaultStore().appendLineReviewEvent(reviewCode, event, webhookEventId);
}

export function listLineReviews(): Promise<StoredLineReview[]> {
  return defaultStore().listLineReviews();
}
