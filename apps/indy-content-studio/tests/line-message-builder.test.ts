import { describe, expect, it } from "vitest";
import { buildLineMessages } from "../features/line-oa/server/line-message-builder";

describe("buildLineMessages", () => {
  it("builds an image message followed by its caption", () => {
    expect(
      buildLineMessages({
        media: { kind: "image", originalUrl: "https://example.test/image.jpg", previewUrl: "https://example.test/image.jpg" },
        caption: "พร้อมโพสต์",
      }),
    ).toEqual([
      { type: "image", originalContentUrl: "https://example.test/image.jpg", previewImageUrl: "https://example.test/image.jpg" },
      { type: "text", text: "พร้อมโพสต์" },
    ]);
  });

  it("builds a secure download message for a document", () => {
    expect(
      buildLineMessages({
        media: { kind: "document", downloadUrl: "https://example.test/download" },
        caption: "ไฟล์งาน",
      }),
    ).toEqual([{ type: "text", text: "ไฟล์งาน\nดาวน์โหลดไฟล์: https://example.test/download" }]);
  });
});
