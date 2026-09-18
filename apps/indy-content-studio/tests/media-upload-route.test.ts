// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaUploadHandler } from "../features/media/server/media-upload-handler";
import { createMediaProviderHandler } from "../features/media/server/media-provider-handler";
import {
  createGoogleDriveMediaClient,
  createGoogleDriveMediaClientFromEnvironment,
  type GoogleDriveMediaClient,
} from "../features/media/server/google-drive-media-client";
import {
  createMediaDeliveryUrl,
  createProviderMediaDeliveryUrls,
  verifyMediaDeliveryUrl,
} from "../features/media/server/media-delivery-url";
import { createVideoPoster } from "../features/media/video-poster";

const MAX_MEDIA_BYTES = 52_428_800;
const signingSecret = "test-signing-secret";
const nowSeconds = 1_800_000_000;

function formRequest(fields: {
  assetId?: string;
  file?: File;
  preview?: File;
}): Request {
  const form = new FormData();
  if (fields.assetId) form.set("assetId", fields.assetId);
  if (fields.file) form.set("file", fields.file);
  if (fields.preview) form.set("preview", fields.preview);
  return new Request("https://studio.example/api/media/upload", { method: "POST", body: form });
}

function fakeClient(overrides: Partial<GoogleDriveMediaClient> = {}): GoogleDriveMediaClient {
  return {
    uploadFile: vi.fn(async ({ name }) => ({ fileId: `drive-${name}` })),
    deleteFile: vi.fn(async () => undefined),
    streamFile: vi.fn(async () => new Response("provider-bytes", {
      status: 200,
      headers: { "Content-Type": "video/mp4", "Content-Length": "14", "Accept-Ranges": "bytes" },
    })),
    ...overrides,
  };
}

function signedRequest(fileId: string, expiresAt = nowSeconds + 60): Request {
  const url = createMediaDeliveryUrl({
    baseUrl: "https://studio.example",
    fileId,
    purpose: "original",
    expiresAt,
    secret: signingSecret,
  });
  return new Request(url);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/media/upload", () => {
  it("returns 503 when Google Drive is disconnected", async () => {
    const handler = createMediaUploadHandler({ getClient: () => null });

    const response = await handler(formRequest({
      assetId: "asset-1",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ยังไม่ได้เชื่อมต่อ Google Drive" });
  });

  it("returns 400 when the request has no file", async () => {
    const handler = createMediaUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({ assetId: "asset-1" }));

    expect(response.status).toBe(400);
  });

  it("returns 413 for a file over 50 MB", async () => {
    const handler = createMediaUploadHandler({ getClient: () => fakeClient() });
    const file = new File([new Uint8Array(MAX_MEDIA_BYTES + 1)], "large.mp4", { type: "video/mp4" });

    const response = await handler(formRequest({ assetId: "asset-1", file }));

    expect(response.status).toBe(413);
  });

  it("returns 400 when a video has no JPEG preview", async () => {
    const handler = createMediaUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({
      assetId: "asset-video",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "วิดีโอต้องมีภาพตัวอย่าง JPEG" });
  });

  it.each([
    ["blank MIME", ""],
    ["spoofed image MIME", "image/jpeg"],
  ])("requires a JPEG preview for a video filename with %s", async (_label, mimeType) => {
    const handler = createMediaUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({
      assetId: "asset-spoofed-video",
      file: new File(["video"], "clip.MP4", { type: mimeType }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "วิดีโอต้องมีภาพตัวอย่าง JPEG" });
  });

  it("returns 413 when a video preview is over 50 MB", async () => {
    const handler = createMediaUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({
      assetId: "asset-large-preview",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      preview: new File([new Uint8Array(MAX_MEDIA_BYTES + 1)], "clip-poster.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(413);
  });

  it("returns a sanitized 502 when Drive rejects an upload", async () => {
    const client = fakeClient({
      uploadFile: vi.fn(async () => { throw new Error("provider secret-token rejected"); }),
    });
    const handler = createMediaUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-1",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: "อัปโหลดไป Google Drive ไม่สำเร็จ" });
    expect(JSON.stringify(json)).not.toContain("secret-token");
  });

  it("uploads an image privately and reuses it as its preview", async () => {
    const client = fakeClient();
    const handler = createMediaUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-image",
      file: new File(["image"], "ภาพงาน.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assetId: "asset-image",
      providerFileId: "drive-ภาพงาน.jpg",
      previewProviderFileId: "drive-ภาพงาน.jpg",
      remoteStatus: "ready",
    });
    expect(client.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("uploads a video and its JPEG preview as separate private files", async () => {
    const client = fakeClient();
    const handler = createMediaUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-video",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      preview: new File(["jpeg"], "clip-poster.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assetId: "asset-video",
      providerFileId: "drive-clip.mp4",
      previewProviderFileId: "drive-clip-poster.jpg",
      remoteStatus: "ready",
    });
    expect(client.uploadFile).toHaveBeenCalledTimes(2);
  });

  it("deletes the original Drive file when the video preview upload fails", async () => {
    const client = fakeClient({
      uploadFile: vi.fn()
        .mockResolvedValueOnce({ fileId: "drive-original" })
        .mockRejectedValueOnce(new Error("preview rejected")),
    });
    const handler = createMediaUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-video",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      preview: new File(["jpeg"], "clip-poster.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(502);
    expect(client.deleteFile).toHaveBeenCalledWith({ fileId: "drive-original" });
    expect(client.deleteFile).toHaveBeenCalledTimes(1);
  });
});

describe("Google Drive client boundary", () => {
  it("uses injected auth and fetch while keeping uploaded files private", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ id: "drive-file-1" }));
    const client = createGoogleDriveMediaClient({
      folderId: "private-folder",
      authClient: { getAccessToken: async () => ({ token: "access-token" }) },
      fetcher,
    });

    await expect(client.uploadFile({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3]),
    })).resolves.toEqual({ fileId: "drive-file-1" });

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer access-token" }));
    expect(await (init?.body as Blob).text()).toContain('"parents":["private-folder"]');
    expect(await (init?.body as Blob).text()).not.toContain("permissions");
  });

  it("constructs the environment client through the injectable auth factory", () => {
    const authClient = { getAccessToken: async () => "access-token" };
    const createAuthClient = vi.fn(() => authClient);

    const client = createGoogleDriveMediaClientFromEnvironment({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.test",
      GOOGLE_PRIVATE_KEY: "line-1\\nline-2",
      GOOGLE_DRIVE_FOLDER_ID: "private-folder",
    }, fetch, createAuthClient);

    expect(client).not.toBeNull();
    expect(createAuthClient).toHaveBeenCalledWith({
      email: "service@example.test",
      key: "line-1\nline-2",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
  });
});

describe("environment-backed media delivery URLs", () => {
  it("creates short-lived HTTPS URLs for provider IDs without adding them to stored metadata", () => {
    const delivery = createProviderMediaDeliveryUrls({
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
      environment: {
        APP_PUBLIC_BASE_URL: "https://studio.example",
        INDY_MEDIA_SIGNING_SECRET: signingSecret,
      },
      now: () => nowSeconds,
    });

    const original = new URL(delivery.originalContentUrl);
    const preview = new URL(delivery.previewImageUrl);
    expect(original.protocol).toBe("https:");
    expect(original.searchParams.get("expiresAt")).toBe(String(nowSeconds + 300));
    expect(preview.searchParams.get("purpose")).toBe("preview");
    expect(verifyMediaDeliveryUrl({
      url: delivery.originalContentUrl,
      expectedFileId: "drive-original",
      secret: signingSecret,
      now: nowSeconds,
    })).toBe(true);
  });

  it("rejects a non-HTTPS public base URL", () => {
    expect(() => createProviderMediaDeliveryUrls({
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
      environment: {
        APP_PUBLIC_BASE_URL: "http://studio.example",
        INDY_MEDIA_SIGNING_SECRET: signingSecret,
      },
      now: () => nowSeconds,
    })).toThrow("APP_PUBLIC_BASE_URL must be an absolute HTTPS URL");
  });
});

describe("signed provider streaming", () => {
  it("rejects invalid and expired signatures before contacting Drive", async () => {
    const client = fakeClient();
    const handler = createMediaProviderHandler({
      getClient: () => client,
      signingSecret,
      now: () => nowSeconds,
    });
    const invalid = new Request(`${signedRequest("file-1").url.replace(/signature=[^&]+/, "signature=modified")}`);

    expect((await handler(invalid, { params: Promise.resolve({ fileId: "file-1" }) })).status).toBe(401);
    expect((await handler(signedRequest("file-1", nowSeconds - 1), { params: Promise.resolve({ fileId: "file-1" }) })).status).toBe(401);
    expect(client.streamFile).not.toHaveBeenCalled();
  });

  it("streams the full provider file with safe response headers", async () => {
    const client = fakeClient();
    const handler = createMediaProviderHandler({ getClient: () => client, signingSecret, now: () => nowSeconds });

    const response = await handler(signedRequest("file-1"), { params: Promise.resolve({ fileId: "file-1" }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("provider-bytes");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });

  it("forwards a video byte range and returns the provider 206 response", async () => {
    const client = fakeClient({
      streamFile: vi.fn(async ({ range }) => new Response("partial", {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": "7",
          "Content-Range": "bytes 10-16/100",
          "Accept-Ranges": "bytes",
          "X-Provider-Secret": "do-not-forward",
        },
      })),
    });
    const handler = createMediaProviderHandler({ getClient: () => client, signingSecret, now: () => nowSeconds });
    const request = new Request(signedRequest("video-1").url, { headers: { Range: "bytes=10-16" } });

    const response = await handler(request, { params: Promise.resolve({ fileId: "video-1" }) });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-16/100");
    expect(response.headers.get("x-provider-secret")).toBeNull();
    expect(client.streamFile).toHaveBeenCalledWith({ fileId: "video-1", range: "bytes=10-16" });
  });
});

describe("video poster", () => {
  it("uses the injected decoder and JPEG encoder boundary", async () => {
    const poster = await createVideoPoster(
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
      {
        decodeFirstFrame: async () => ({ source: {} as CanvasImageSource, width: 640, height: 360 }),
        encodeJpeg: async ({ width, height }) => new Blob([`${width}x${height}`], { type: "image/jpeg" }),
      },
    );

    expect(poster.type).toBe("image/jpeg");
    expect(await poster.text()).toBe("640x360");
  });
});
