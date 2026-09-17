import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import worker from "../../../worker";

describe("LINE webhook worker", () => {
  it("accepts a request with a valid LINE signature", async () => {
    const rawBody = '{"events":[]}';
    const signature = createHmac("sha256", "channel-secret")
      .update(rawBody)
      .digest("base64");

    const response = await worker.fetch(new Request("https://example.test/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": signature },
      body: rawBody,
    }), { LINE_CHANNEL_SECRET: "channel-secret" });

    expect(response.status).toBe(200);
  });
});
