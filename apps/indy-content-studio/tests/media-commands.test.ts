import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { createExternalMedia, createUploadedMedia, moveMediaToTrash, restoreMedia, updateMedia } from "../features/media/media-commands";

const now = "2026-09-18T00:00:00.000Z";

describe("media commands", () => {
  it("creates local media and rejects oversized or blank files", () => {
    const state = createEmptyDashboardState();
    const next = createUploadedMedia(state, { id: "asset-1", name: "ผลงาน.jpg", mimeType: "image/jpeg", size: 12, now, tags: [" งาน ", "ภาพ"] });
    expect(next.media[0]).toMatchObject({ id: "asset-1", name: "ผลงาน.jpg", remoteStatus: "local-only", tags: ["งาน", "ภาพ"] });
    expect(() => createUploadedMedia(state, { id: "large", name: "large.mp4", mimeType: "video/mp4", size: 52_428_801, now })).toThrow("ไฟล์มีขนาดเกิน 50 MB");
    expect(() => createUploadedMedia(state, { id: "blank", name: " ", mimeType: "image/jpeg", size: 10, now })).toThrow("กรุณาระบุชื่อไฟล์");
    expect(() => createUploadedMedia(state, { id: "dup", name: "dup.jpg", mimeType: "image/jpeg", size: 10, now, tags: ["งาน", " งาน "] })).toThrow("แท็กซ้ำกัน");
  });

  it("validates external links and supports update, trash, and restore", () => {
    const state = createEmptyDashboardState();
    expect(() => createExternalMedia(state, { id: "bad", name: "คลิป", mimeType: "video/mp4", externalUrl: "http://unsafe.test", now })).toThrow("ต้องเป็นลิงก์ https");
    expect(() => createExternalMedia(state, { id: "video", name: "คลิป", mimeType: "video/mp4", externalUrl: "https://video.test/a.mp4", now })).toThrow("วิดีโอต้องมีลิงก์ภาพตัวอย่าง https");
    const created = createExternalMedia(state, { id: "video", name: "คลิป", mimeType: "video/mp4", externalUrl: "https://video.test/a.mp4", externalPreviewUrl: "https://video.test/poster.jpg", now });
    const updated = updateMedia(created, "video", { tags: ["แคมเปญ"], name: "คลิปใหม่" });
    expect(updated.media[0]).toMatchObject({ name: "คลิปใหม่", tags: ["แคมเปญ"] });
    const trashed = moveMediaToTrash(updated, "video", now);
    expect(trashed.media[0].deletedAt).toBe(now);
    expect(restoreMedia(trashed, "video").media[0].deletedAt).toBeNull();
  });
});
