import { verifyLineSignature } from "./line-signature";
import { parseLinePairingEvent } from "./line-pairing-event";
import { NeonLineConnectionRepository } from "./line-connection-repository";
import { parseLineReviewCommand } from "./line-review-command";
import { appendLineReviewEvent, getLineReview } from "./line-review-store";

type WebhookEvent = {
  webhookEventId?: string;
  type?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

type WebhookRepository = Pick<NeonLineConnectionRepository, "claimPairingCode">;
type WebhookHandlerOptions = { getRepository?: () => WebhookRepository };

export function createLineWebhookHandler({ getRepository = () => new NeonLineConnectionRepository() }: WebhookHandlerOptions = {}) {
  return async function handleLineWebhook(request: Request): Promise<Response> {
    const rawBody = await request.text();
    const signature = request.headers.get("x-line-signature") ?? "";
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelSecret || !verifyLineSignature(rawBody, signature, channelSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: { events?: WebhookEvent[] };
    try {
      payload = JSON.parse(rawBody) as { events?: WebhookEvent[] };
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    for (const event of payload.events ?? []) {
      const pairing = parseLinePairingEvent(event);
      if (pairing && event.webhookEventId) {
        try {
          await getRepository().claimPairingCode({ ...pairing, webhookEventId: event.webhookEventId });
        } catch {
          return new Response("Service Unavailable", { status: 503 });
        }
        continue;
      }

      if (event.type !== "message" || event.message?.type !== "text" || !event.message.text) continue;
      const command = parseLineReviewCommand(event.message.text);
      if (!command || event.source?.type !== "user" || !event.source.userId) continue;
      let review;
      try {
        review = await getLineReview(command.reviewCode);
      } catch {
        return new Response("Service Unavailable", { status: 503 });
      }
      if (!review || review.recipientUserId !== event.source.userId) continue;
      const now = new Date().toISOString();
      try {
        await appendLineReviewEvent(command.reviewCode, {
          id: `line-webhook-${event.webhookEventId ?? now}`,
          event: command.kind === "approve" ? "approved" : "correction-requested",
          comment: command.kind === "correction" ? command.comment : null,
          occurredAt: now,
        }, event.webhookEventId);
      } catch {
        return new Response("Service Unavailable", { status: 503 });
      }
    }

    return new Response("OK", { status: 200 });
  };
}
