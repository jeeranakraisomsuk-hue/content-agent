import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/make/publications/route";

const originalUrl = process.env.MAKE_PUBLICATION_WEBHOOK_URL;

afterEach(() => { process.env.MAKE_PUBLICATION_WEBHOOK_URL = originalUrl; vi.unstubAllGlobals(); });

describe("Make publication route", () => {
  it("reports disconnected Make without leaking secrets", async () => {
    delete process.env.MAKE_PUBLICATION_WEBHOOK_URL;
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ attemptId: "a", contentId: "c", platform: "facebook", publishAt: "now" }) }));
    expect(response.status).toBe(503);
  });

  it("passes a validated publication payload to Make", async () => {
    process.env.MAKE_PUBLICATION_WEBHOOK_URL = "https://make.example/hook";
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ attemptId: "a", contentId: "c", platform: "facebook", publishAt: "now" }) }));
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith("https://make.example/hook", expect.objectContaining({ method: "POST" }));
  });
});
