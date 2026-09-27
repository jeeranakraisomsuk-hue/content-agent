// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { uploadMediaToBlob } from "../features/media/blob-media-upload";

describe("Blob media upload", () => {
  it("returns ready only after a private Blob upload returns a pathname", async () => {
    const uploader = vi.fn(async () => ({ pathname: "media/asset-1/photo-random.jpg" }));
    const fetcher = vi.fn(async () => Response.json({ integrations: [{ provider: "blob", status: "connected" }] }));
    const result = await uploadMediaToBlob({
      assetId: "asset-1",
      name: "photo.jpg",
      mimeType: "image/jpeg",
      blob: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
      fetcher: fetcher as typeof fetch,
      uploader,
    });

    expect(result).toEqual({
      remoteStatus: "ready",
      providerFileId: "blob:media/asset-1/photo-random.jpg",
      previewProviderFileId: "blob:media/asset-1/photo-random.jpg",
    });
    expect(uploader).toHaveBeenCalledWith(
      expect.stringMatching(/^media\/asset-1\/.+\.jpg$/),
      expect.any(File),
      expect.objectContaining({ access: "private", handleUploadUrl: "/api/media/upload" }),
    );
  });

  it("keeps media local when Blob storage is disconnected", async () => {
    const uploader = vi.fn();
    const result = await uploadMediaToBlob({
      assetId: "asset-1",
      name: "photo.jpg",
      mimeType: "image/jpeg",
      blob: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
      fetcher: vi.fn(async () => Response.json({ integrations: [{ provider: "blob", status: "disconnected" }] })) as typeof fetch,
      uploader,
    });

    expect(result).toEqual({ remoteStatus: "local-only" });
    expect(uploader).not.toHaveBeenCalled();
  });
});
