import { pushLineMessages } from "../../../../features/line-oa/server/line-push-client";
import { registerLineReview, appendLineReviewEvent } from "../../../../features/line-oa/server/line-review-store";

type ReviewBody = {
  contentId?: string;
  cycleId?: string;
  reviewCode?: string;
  recipientUserId?: string;
  messages?: Array<{ type: "text"; text: string } | { type: "image" | "video"; originalContentUrl: string; previewImageUrl: string }>;
  idempotencyKey?: string;
};

export async function POST(request: Request): Promise<Response> {
  let body: ReviewBody;
  try {
    body = await request.json() as ReviewBody;
  } catch {
    return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  if (!body.contentId || !body.cycleId || !body.reviewCode || !body.recipientUserId || !body.messages?.length) {
    return Response.json({ error: "ข้อมูลส่งตรวจไม่ครบ" }, { status: 400 });
  }
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return Response.json({ error: "ยังไม่ได้เชื่อมต่อ LINE" }, { status: 503 });

  registerLineReview({ contentId: body.contentId, cycleId: body.cycleId, reviewCode: body.reviewCode, recipientUserId: body.recipientUserId });
  try {
    await pushLineMessages({ fetcher: fetch, accessToken, recipientUserId: body.recipientUserId, retryKey: body.idempotencyKey ?? body.cycleId, messages: body.messages });
    const now = new Date().toISOString();
    appendLineReviewEvent(body.reviewCode, { id: `line-sent-${body.cycleId}`, event: "sent", comment: null, occurredAt: now });
    return Response.json({ status: "sent", reviewCode: body.reviewCode });
  } catch (caught) {
    const now = new Date().toISOString();
    appendLineReviewEvent(body.reviewCode, { id: `line-failed-${body.cycleId}`, event: "failed", comment: caught instanceof Error ? caught.message : "LINE delivery failed", occurredAt: now });
    return Response.json({ error: caught instanceof Error ? caught.message : "ส่ง LINE ไม่สำเร็จ" }, { status: 502 });
  }
}
