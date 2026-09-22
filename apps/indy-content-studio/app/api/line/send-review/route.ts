import { createHash } from "node:crypto";
import { requireAdmin, AdminAuthenticationError } from "../../../../features/auth/server/admin-session";
import { NeonDashboardRepository } from "../../../../features/data/server/neon-dashboard-repository";
import { NeonLineConnectionRepository } from "../../../../features/line-oa/server/line-connection-repository";
import { LinePushError, pushLineMessages } from "../../../../features/line-oa/server/line-push-client";
import { appendLineReviewEvent, registerLineReview } from "../../../../features/line-oa/server/line-review-store";

type ReviewRequest = { contentId: string; cycleId: string; reviewCode: string };

function stableReviewRetryKey(contentId: string, cycleId: string, reviewCode: string, recipient: string, text: string): string {
  const digest = createHash("sha256").update([contentId, cycleId, reviewCode, recipient, text].join("\n")).digest("hex");
  const variant = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof AdminAuthenticationError) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "line_review_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const values = body as Record<string, unknown>;
  if (Object.keys(values).length !== 3 || typeof values.contentId !== "string" || !values.contentId.trim()
    || typeof values.cycleId !== "string" || !values.cycleId.trim()
    || typeof values.reviewCode !== "string" || !values.reviewCode.trim()) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const reviewRequest = values as ReviewRequest;

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return Response.json({ error: "configuration" }, { status: 503, headers: { "Cache-Control": "no-store" } });

  let content: Awaited<ReturnType<NeonDashboardRepository["loadDashboardState"]>>["state"]["contents"][number];
  let recipient: string | null;
  try {
    const [{ state }, activeRecipient] = await Promise.all([
      new NeonDashboardRepository().loadDashboardState(),
      new NeonLineConnectionRepository().getActiveRecipient(),
    ]);
    content = state.contents.find((item) => item.id === reviewRequest.contentId && !item.deletedAt)!;
    recipient = activeRecipient;
  } catch {
    return Response.json({ error: "line_review_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!content || content.lineReview.activeCycleId !== reviewRequest.cycleId || content.lineReview.reviewCode !== reviewRequest.reviewCode) {
    return Response.json({ error: "stale_review" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (content.lineReview.status === "sent" || content.lineReview.status === "approved") {
    return Response.json({ error: "review_already_sent" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (!recipient) return Response.json({ error: "recipient" }, { status: 409, headers: { "Cache-Control": "no-store" } });

  let storedReview;
  try {
    storedReview = await registerLineReview({
      contentId: content.id,
      cycleId: reviewRequest.cycleId,
      reviewCode: reviewRequest.reviewCode,
      recipientUserId: recipient,
    });
  } catch {
    return Response.json({ error: "line_review_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (storedReview.contentId !== content.id || storedReview.cycleId !== reviewRequest.cycleId || storedReview.recipientUserId !== recipient) {
    return Response.json({ error: "stale_review" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const text = `ตรวจคอนเทนต์: ${content.title}\n${content.caption}\nรหัส: ${reviewRequest.reviewCode}\nตอบกลับ “อนุมัติ ${reviewRequest.reviewCode}” หรือ “แก้ไข ${reviewRequest.reviewCode}: รายละเอียด”`;
  const retryKey = stableReviewRetryKey(content.id, reviewRequest.cycleId, reviewRequest.reviewCode, recipient, text);
  const occurredAt = new Date().toISOString();
  try {
    await pushLineMessages({
      fetcher: fetch,
      accessToken,
      recipientUserId: recipient,
      retryKey,
      messages: [{ type: "text", text }],
    });
  } catch (error) {
    const category = error instanceof LinePushError ? error.category : "provider";
    await appendLineReviewEvent(reviewRequest.reviewCode, {
      id: `line-failed-${reviewRequest.cycleId}`,
      event: "failed",
      comment: null,
      occurredAt,
    }).catch(() => undefined);
    return Response.json({ error: category }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  try {
    await appendLineReviewEvent(reviewRequest.reviewCode, {
      id: `line-sent-${reviewRequest.cycleId}`,
      event: "sent",
      comment: null,
      occurredAt,
    });
  } catch {
    return Response.json({ error: "line_review_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ status: "sent", reviewCode: reviewRequest.reviewCode }, { headers: { "Cache-Control": "no-store" } });
}
