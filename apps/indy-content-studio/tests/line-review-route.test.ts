import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminSessionToken } from "../features/auth/server/admin-session";
import { POST as sendReview } from "../app/api/line/send-review/route";
import { GET as listReviews } from "../app/api/line/reviews/route";
import { POST as webhook } from "../app/api/line/webhook/route";

const routeData = vi.hoisted(() => ({
  contentId: "c",
  cycleId: "cycle",
  reviewCode: "R-ABC234",
  title: "Authoritative review title",
  caption: "Authoritative caption",
  recipient: "u",
  status: "queued",
}));

vi.mock("../features/data/server/neon-dashboard-repository", () => ({
  NeonDashboardRepository: class {
    loadDashboardState = async () => ({
      version: 1,
      state: { contents: [{
        id: routeData.contentId,
        title: routeData.title,
        caption: routeData.caption,
        deletedAt: null,
        lineReview: { activeCycleId: routeData.cycleId, reviewCode: routeData.reviewCode, status: routeData.status },
      }] },
    });
  },
}));

vi.mock("../features/line-oa/server/line-connection-repository", () => ({
  NeonLineConnectionRepository: class {
    getActiveRecipient = async () => routeData.recipient;
    claimPairingCode = async () => "paired";
  },
}));

const reviewStore = vi.hoisted(() => {
  const records = new Map<string, any>();
  return {
    reset: () => records.clear(),
    register: async (review: any) => {
      const existing = records.get(review.reviewCode);
      if (existing) return existing;
      const stored = { ...review, events: [], handledWebhookEventIds: [] };
      records.set(review.reviewCode, stored);
      return stored;
    },
    get: async (code: string) => records.get(code) ?? null,
    append: async (code: string, event: any, webhookEventId?: string) => {
      const stored = records.get(code);
      if (!stored || (webhookEventId && stored.handledWebhookEventIds.includes(webhookEventId))) return stored ?? null;
      if (webhookEventId) stored.handledWebhookEventIds.push(webhookEventId);
      if (!stored.events.some((item: any) => item.id === event.id)) stored.events.push(event);
      return stored;
    },
    list: async () => [...records.values()],
  };
});

vi.mock("../features/line-oa/server/line-review-store", () => ({
  registerLineReview: reviewStore.register,
  getLineReview: reviewStore.get,
  appendLineReviewEvent: reviewStore.append,
  listLineReviews: reviewStore.list,
}));

const originalToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const originalSecret = process.env.LINE_CHANNEL_SECRET;
const originalAuthSecret = process.env.AUTH_SECRET;
const authSecret = "test-admin-secret-with-more-than-thirty-two-bytes";
type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const baseReviewBody = { contentId: "c", cycleId: "cycle", reviewCode: "R-ABC234" };

beforeEach(() => {
  routeData.contentId = "c";
  routeData.cycleId = "cycle";
  routeData.reviewCode = "R-ABC234";
  routeData.title = "Authoritative review title";
  routeData.caption = "Authoritative caption";
  routeData.recipient = "u";
  routeData.status = "queued";
});

afterEach(() => {
  reviewStore.reset();
  if (originalToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  else process.env.LINE_CHANNEL_ACCESS_TOKEN = originalToken;
  if (originalSecret === undefined) delete process.env.LINE_CHANNEL_SECRET;
  else process.env.LINE_CHANNEL_SECRET = originalSecret;
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
  vi.unstubAllGlobals();
});

async function authorizedSendReview(body: unknown): Promise<Response> {
  process.env.AUTH_SECRET = authSecret;
  const token = await createAdminSessionToken(authSecret);
  return sendReview(new Request("https://example.test/api/line/send-review", {
    method: "POST",
    headers: { cookie: `indy_admin_session=${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("LINE review routes", () => {
  it("requires an authenticated administrator", async () => {
    process.env.AUTH_SECRET = authSecret;
    const response = await sendReview(new Request("https://example.test/api/line/send-review", {
      method: "POST", body: JSON.stringify(baseReviewBody),
    }));

    expect(response.status).toBe(401);
  });

  it("rejects review delivery when LINE is disconnected", async () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    expect((await authorizedSendReview(baseReviewBody)).status).toBe(503);
  });

  it("rejects browser-supplied LINE IDs and message arrays", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const response = await authorizedSendReview({ ...baseReviewBody, recipientUserId: "U-attacker", messages: [{ type: "text", text: "forged" }] });

    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an obsolete review cycle and refuses a second send after success", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    expect((await authorizedSendReview({ ...baseReviewBody, cycleId: "old-cycle" })).status).toBe(409);
    routeData.status = "sent";
    expect((await authorizedSendReview(baseReviewBody)).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("builds review text from saved content and sends only to the paired recipient", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const sent = await authorizedSendReview(baseReviewBody);

    expect(sent.status).toBe(200);
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { to: string; messages: Array<{ text: string }> };
    expect(request.to).toBe("u");
    expect(request.messages[0]?.text).toContain("Authoritative review title");
    expect(request.messages[0]?.text).toContain("Authoritative caption");
    expect(request.messages[0]?.text).not.toContain("forged");
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("X-Line-Retry-Key"))
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("sends, stores, and receives an approval command idempotently", async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await authorizedSendReview(baseReviewBody);

    const rawBody = JSON.stringify({ events: [{ webhookEventId: "evt-1", type: "message", source: { type: "user", userId: "u" }, message: { type: "text", text: "อนุมัติ R-ABC234" } }] });
    process.env.LINE_CHANNEL_SECRET = "secret";
    const signature = createHmac("sha256", "secret").update(rawBody).digest("base64");
    expect((await webhook(new Request("https://example.test", { method: "POST", headers: { "x-line-signature": signature }, body: rawBody }))).status).toBe(200);
    await webhook(new Request("https://example.test", { method: "POST", headers: { "x-line-signature": signature }, body: rawBody }));

    const response = await listReviews(new Request("https://example.test/api/line/reviews?reviewCode=R-ABC234"));
    const json = await response.json() as { reviews: Array<{ events: Array<{ event: string }> }> };
    expect(json.reviews[0].events.map((event) => event.event)).toEqual(["sent", "approved"]);
  });

  it("does not expose a raw LINE recipient ID in review responses", async () => {
    routeData.contentId = "private-content";
    routeData.cycleId = "private-cycle";
    routeData.reviewCode = "R-DEF456";
    routeData.recipient = "U0123456789abcdef";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await authorizedSendReview({ contentId: routeData.contentId, cycleId: routeData.cycleId, reviewCode: routeData.reviewCode });

    const response = await listReviews(new Request("https://example.test/api/line/reviews?reviewCode=R-DEF456"));
    const json = await response.json() as { reviews: Array<{ recipientUserId?: string; recipientMasked?: string }> };

    expect(JSON.stringify(json)).not.toContain("U0123456789abcdef");
    expect(json.reviews[0].recipientMasked).toBe("••••cdef");
    expect(json.reviews[0].recipientUserId).toBeUndefined();
  });
});
