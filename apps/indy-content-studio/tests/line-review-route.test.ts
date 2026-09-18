import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as sendReview } from "../app/api/line/send-review/route";
import { GET as listReviews } from "../app/api/line/reviews/route";
import { POST as webhook } from "../app/api/line/webhook/route";
import { clearLineReviewStore, registerLineReview } from "../features/line-oa/server/line-review-store";

const originalToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const originalSecret = process.env.LINE_CHANNEL_SECRET;

afterEach(() => {
  clearLineReviewStore();
  process.env.LINE_CHANNEL_ACCESS_TOKEN = originalToken;
  process.env.LINE_CHANNEL_SECRET = originalSecret;
  vi.unstubAllGlobals();
});

describe("LINE review routes", () => {
  it("rejects review delivery when LINE is disconnected", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const response = await sendReview(new Request("https://example.test", { method: "POST", body: JSON.stringify({ contentId: "c", cycleId: "cycle", reviewCode: "R-ABC234", recipientUserId: "u", messages: [{ type: "text", text: "ตรวจ" }] }) }));
    expect(response.status).toBe(503);
  });

  it("sends, stores, and receives an approval command idempotently", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const sent = await sendReview(new Request("https://example.test", { method: "POST", body: JSON.stringify({ contentId: "c", cycleId: "cycle", reviewCode: "R-ABC234", recipientUserId: "u", messages: [{ type: "text", text: "ตรวจ" }] }) }));
    expect(sent.status).toBe(200);

    const rawBody = JSON.stringify({ events: [{ webhookEventId: "evt-1", type: "message", source: { type: "user", userId: "u" }, message: { type: "text", text: "อนุมัติ R-ABC234" } }] });
    process.env.LINE_CHANNEL_SECRET = "secret";
    const signature = createHmac("sha256", "secret").update(rawBody).digest("base64");
    expect((await webhook(new Request("https://example.test", { method: "POST", headers: { "x-line-signature": signature }, body: rawBody }))).status).toBe(200);
    await webhook(new Request("https://example.test", { method: "POST", headers: { "x-line-signature": signature }, body: rawBody }));

    const response = await listReviews(new Request("https://example.test/api/line/reviews?reviewCode=R-ABC234"));
    const json = await response.json() as { reviews: Array<{ events: Array<{ event: string }> }> };
    expect(json.reviews[0].events.map((event) => event.event)).toEqual(["sent", "approved"]);
  });
});
