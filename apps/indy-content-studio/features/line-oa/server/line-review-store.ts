import type { LineReviewEvent } from "../review-model";

export interface StoredLineReview {
  contentId: string;
  cycleId: string;
  reviewCode: string;
  recipientUserId: string;
  events: Array<{ id: string; event: LineReviewEvent; comment: string | null; occurredAt: string; providerReceipt?: string }>;
  handledWebhookEventIds: string[];
}

const globalStore = globalThis as typeof globalThis & { __indyLineReviewStore?: Map<string, StoredLineReview> };
const store = globalStore.__indyLineReviewStore ?? new Map<string, StoredLineReview>();
globalStore.__indyLineReviewStore = store;

export function registerLineReview(review: Omit<StoredLineReview, "events" | "handledWebhookEventIds">): StoredLineReview {
  const existing = store.get(review.reviewCode);
  if (existing) return existing;
  const next = { ...review, events: [], handledWebhookEventIds: [] };
  store.set(review.reviewCode, next);
  return next;
}

export function getLineReview(reviewCode: string): StoredLineReview | null {
  return store.get(reviewCode) ?? null;
}

export function appendLineReviewEvent(reviewCode: string, event: StoredLineReview["events"][number], webhookEventId?: string): StoredLineReview | null {
  const review = store.get(reviewCode);
  if (!review) return null;
  if (webhookEventId && review.handledWebhookEventIds.includes(webhookEventId)) return review;
  if (webhookEventId) review.handledWebhookEventIds = [...review.handledWebhookEventIds, webhookEventId];
  if (!review.events.some((item) => item.id === event.id)) review.events = [...review.events, event];
  return review;
}

export function listLineReviews(): StoredLineReview[] {
  return [...store.values()].map((review) => ({ ...review, events: [...review.events], handledWebhookEventIds: [...review.handledWebhookEventIds] }));
}

export function clearLineReviewStore(): void {
  store.clear();
}
