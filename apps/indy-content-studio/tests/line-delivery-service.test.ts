// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem, DashboardState, MediaAsset } from "../features/domain/types";
import type { SqlExecutor } from "../features/data/server/neon-client";
import { LineDeliveryService } from "../features/line-oa/server/line-delivery-service";

const updatedAt = "2026-09-22T12:00:00.000Z";
const recipientUserId = "U0123456789abcdef";
const retryUuid = "00000000-0000-4000-8000-000000000001";
const environment = {
  APP_PUBLIC_BASE_URL: "https://indy.example",
  INDY_MEDIA_SIGNING_SECRET: "media-signing-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-access-token",
};
type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function contentItem(input: { caption?: string; assetIds?: string[]; updatedAt?: string } = {}): ContentItem {
  return {
    id: "content-1",
    title: "Test content",
    categoryId: "category-1",
    formatId: "format-1",
    owner: "owner",
    objective: "awareness",
    priority: "normal",
    plannedWorkAt: null,
    lastWorkedAt: null,
    readyDate: null,
    productionStatus: "ready",
    assetIds: input.assetIds ?? ["asset-1"],
    processSteps: [],
    caption: input.caption ?? "Authoritative caption",
    captionSource: null,
    schedules: [],
    referenceIds: [],
    notes: "",
    localApproval: "approved",
    lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
    createdAt: updatedAt,
    updatedAt: input.updatedAt ?? updatedAt,
    deletedAt: null,
  };
}

function mediaAsset(input: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    name: "photo.jpg",
    mimeType: "image/jpeg",
    size: 10,
    source: "upload",
    externalUrl: null,
    externalPreviewUrl: null,
    blobKey: "asset-1",
    remoteStatus: "ready",
    providerFileId: "drive-original",
    previewProviderFileId: null,
    tags: [],
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    ...input,
  };
}

function stateFor(content = contentItem(), media = [mediaAsset()]): DashboardState {
  return { ...createEmptyDashboardState(), contents: [content], media };
}

function memoryDeliveryDatabase(createdAt = updatedAt) {
  const rows = new Map<string, {
    id: string;
    idempotency_key: string;
    status: "queued" | "sent" | "failed";
    sent_at: string | null;
    error_category: string | null;
    created_at: string;
    attempt_count: number;
  }>();
  const execute = vi.fn<SqlExecutor>(async (query, params) => {
    if (query.includes("INSERT INTO line_deliveries")) {
      const key = String(params[1]);
      const existing = rows.get(key);
      if (existing) {
        if (existing.status !== "sent") {
          existing.status = "queued";
          existing.error_category = null;
          existing.attempt_count += 1;
        }
        return [{ ...existing }];
      }
      const created = {
        id: String(params[0]),
        idempotency_key: key,
        status: "queued" as const,
        sent_at: null,
        error_category: null,
        created_at: createdAt,
        attempt_count: 1,
      };
      rows.set(key, created);
      return [{ ...created }];
    }

    const id = String(params[0]);
    const row = [...rows.values()].find((item) => item.id === id);
    if (!row) return [];
    if (query.includes("status = 'sent'")) {
      row.status = "sent";
      row.error_category = null;
      row.sent_at = updatedAt;
    } else {
      row.status = "failed";
      row.error_category = String(params[1]);
    }
    return [{ ...row }];
  });
  return { execute, rows };
}

function service(options: {
  content?: ContentItem;
  media?: MediaAsset[];
  recipient?: string | null;
  fetcher?: TestFetcher;
  databaseCreatedAt?: string;
  now?: () => number;
} = {}) {
  const database = memoryDeliveryDatabase(options.databaseCreatedAt);
  const state = stateFor(options.content ?? contentItem(), options.media ?? [mediaAsset()]);
  const fetcher = options.fetcher ?? vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
  const instance = new LineDeliveryService({
    loadDashboardSnapshot: async () => ({ state, version: 1 }),
    getActiveRecipient: async () => options.recipient === undefined ? recipientUserId : options.recipient,
    execute: database.execute,
    fetcher,
    environment,
    now: options.now ?? (() => Date.parse(updatedAt)),
    generateId: () => retryUuid,
  });
  return { instance, database, fetcher, state };
}

function send(instance: LineDeliveryService, content = contentItem()) {
  return instance.sendContentToLine({ contentId: content.id, expectedUpdatedAt: content.updatedAt, actorId: "primary-admin" });
}

describe("server-owned LINE delivery", () => {
  it("sends the authoritative image URL and caption without accepting browser payloads", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      to: string;
      messages: Array<{ type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string }>;
    };
    expect(result.status).toBe("sent");
    expect(request.to).toBe(recipientUserId);
    expect(request.messages).toEqual([
      {
        type: "image",
        originalContentUrl: expect.stringContaining("/api/media/provider/drive-original"),
        previewImageUrl: expect.stringContaining("/api/media/provider/drive-original"),
      },
      { type: "text", text: "Authoritative caption" },
    ]);
    expect(request.messages[0].originalContentUrl).toMatch(/^https:\/\//);
  });

  it("rejects an empty caption before sending an MP4", async () => {
    const content = contentItem({ caption: "   " });
    const video = mediaAsset({ mimeType: "video/mp4", name: "clip.mp4", providerFileId: "drive-video", previewProviderFileId: "drive-poster" });
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ content, media: [video], fetcher });

    await expect(send(setup.instance, content)).rejects.toMatchObject({ code: "caption_required" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends a video with its persisted JPEG poster and authoritative caption", async () => {
    const content = contentItem({ caption: "Watch this" });
    const video = mediaAsset({ mimeType: "video/mp4", name: "clip.mp4", providerFileId: "drive-video", previewProviderFileId: "drive-poster" });
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ content, media: [video], fetcher });

    await send(setup.instance, content);

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { messages: Array<Record<string, string>> };
    expect(request.messages).toEqual([
      { type: "video", originalContentUrl: expect.stringContaining("drive-video"), previewImageUrl: expect.stringContaining("drive-poster") },
      { type: "text", text: "Watch this" },
    ]);
  });

  it("rejects an MP4 without its persisted JPEG preview", async () => {
    const content = contentItem();
    const video = mediaAsset({ mimeType: "video/mp4", previewProviderFileId: null });
    const setup = service({ content, media: [video] });

    await expect(send(setup.instance, content)).rejects.toMatchObject({ code: "preview_missing" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it("rejects stale revisions and contents without a ready remote asset", async () => {
    const content = contentItem();
    const setup = service({ content, media: [mediaAsset({ remoteStatus: "uploading" })] });

    await expect(setup.instance.sendContentToLine({ contentId: content.id, expectedUpdatedAt: "older", actorId: "primary-admin" }))
      .rejects.toMatchObject({ code: "stale_content" });
    await expect(send(setup.instance, content)).rejects.toMatchObject({ code: "asset_not_ready" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it("records a safe recipient failure without calling LINE when no recipient is paired", async () => {
    const setup = service({ recipient: null });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "recipient" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, "configuration"],
    [403, "configuration"],
    [429, "quota"],
    [500, "provider"],
  ] as const)("maps LINE HTTP %i to safe category %s", async (status, errorCategory) => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("provider token must not escape", { status }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory });
    expect(JSON.stringify(result)).not.toContain("provider token");
  });

  it.each([
    [400, "The user has blocked this official account", "recipient"],
    [400, "The server was unable to fetch the content URL", "media_fetch"],
    [409, "duplicate without accepted request id", "provider"],
  ] as const)("maps LINE response details to %s without exposing provider text", async (status, detail, errorCategory) => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response(detail, { status }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory });
    expect(JSON.stringify(result)).not.toContain(detail);
  });

  it("treats a 409 with LINE's accepted request id as the original successful delivery", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response(null, {
      status: 409,
      headers: { "x-line-accepted-request-id": "accepted-original-request" },
    }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "sent", id: retryUuid });
  });

  it("maps timeouts to a retryable safe category", async () => {
    const timeout = new DOMException("upstream timed out", "TimeoutError");
    const fetcher = vi.fn(async () => { throw timeout; });
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "timeout" });
  });

  it("reuses one UUID retry key for simultaneous clicks and never pushes again after success", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher });

    const [first, second] = await Promise.all([send(setup.instance), send(setup.instance)]);
    await send(setup.instance);

    const retryKeys = fetcher.mock.calls.map((call) => new Headers(call[1]?.headers).get("X-Line-Retry-Key"));
    expect(first.id).toBe(second.id);
    expect(retryKeys).toEqual([retryUuid, retryUuid]);
    expect(retryKeys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reuses the identical request body and retry key after an uncertain transient failure", async () => {
    let now = Date.parse(updatedAt);
    const fetcher = vi.fn<TestFetcher>()
      .mockRejectedValueOnce(new Error("connection closed before response"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const setup = service({ fetcher, now: () => now });

    const failed = await send(setup.instance);
    now += 60_000;
    const retried = await send(setup.instance);

    expect(failed.status).toBe("failed");
    expect(retried.status).toBe("sent");
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(fetcher.mock.calls[1]?.[1]?.body);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("X-Line-Retry-Key"))
      .toBe(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("X-Line-Retry-Key"));
  });

  it("does not replay after signed media URLs have expired, even inside LINE's retry-key window", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher, now: () => Date.parse(updatedAt) + 60 * 60 * 1_000 });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "timeout" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not retry an uncertain queued delivery after LINE's 24-hour retry-key window", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher, databaseCreatedAt: "2026-09-20T10:00:00.000Z" });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "timeout" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
