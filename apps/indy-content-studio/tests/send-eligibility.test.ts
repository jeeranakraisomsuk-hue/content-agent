import { describe, expect, it } from "vitest";
import { canSendToLine } from "../features/content/send-eligibility";

describe("canSendToLine", () => {
  it.each([
    [{ assetState: "missing" as const, caption: "พร้อมแล้ว" }, false],
    [{ assetState: "uploading" as const, caption: "พร้อมแล้ว" }, false],
    [{ assetState: "ready" as const, caption: "   " }, false],
    [{ assetState: "ready" as const, caption: "พร้อมแล้ว" }, true],
  ])("returns %s when asset and caption state are incomplete", (input, expected) => {
    expect(canSendToLine(input)).toBe(expected);
  });
});
