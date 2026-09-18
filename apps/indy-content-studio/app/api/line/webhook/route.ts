import { verifyLineSignature } from "../../../../features/line-oa/server/line-signature";
import { parseLineReviewCommand } from "../../../../features/line-oa/server/line-review-command";
import { appendLineReviewEvent, getLineReview } from "../../../../features/line-oa/server/line-review-store";

type WebhookEvent = {
  webhookEventId?: string;
  type?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

export async function POST(request: Request): Promise<Response> {
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
    if (event.type !== "message" || event.message?.type !== "text" || !event.message.text) continue;
    const command = parseLineReviewCommand(event.message.text);
    if (!command || !getLineReview(command.reviewCode)) continue;
    const now = new Date().toISOString();
    appendLineReviewEvent(command.reviewCode, {
      id: `line-webhook-${event.webhookEventId ?? now}`,
      event: command.kind === "approve" ? "approved" : "correction-requested",
      comment: command.kind === "correction" ? command.comment : null,
      occurredAt: now,
    }, event.webhookEventId);
  }

  return new Response("OK", { status: 200 });
}
