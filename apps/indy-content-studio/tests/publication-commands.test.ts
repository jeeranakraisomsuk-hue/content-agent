import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { createPublicationAttempt, markPublicationEvidence, updatePublicationAttempt } from "../features/publication/publication-commands";

function content(): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "publish-content", title: "โพสต์พร้อมส่ง", categoryId: "cat", formatId: "format", owner: "ทีม", objective: "sales", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: "2026-09-18", productionStatus: "ready", assetIds: [], processSteps: [], caption: "พร้อม", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-09-20T10:00", latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: "cycle", reviewCode: "R-ABC234", providerReceipts: [], lastEventAt: now, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
}

describe("publication commands", () => {
  it("creates an idempotent local plan and updates delivery status", () => {
    const state = { ...createEmptyDashboardState(), contents: [content()] };
    const planned = createPublicationAttempt(state, { contentId: "publish-content", platform: "facebook", publishAt: "2026-09-20T10:00" }, "now");
    expect(planned.publicationAttempts).toHaveLength(1);
    expect(createPublicationAttempt(planned, { contentId: "publish-content", platform: "facebook", publishAt: "2026-09-20T10:00" }, "later").publicationAttempts).toHaveLength(1);
    const queued = updatePublicationAttempt(planned, planned.publicationAttempts[0].id, { status: "queued", queueId: "q1" }, "later");
    expect(queued.publicationAttempts[0].queueId).toBe("q1");
    expect(markPublicationEvidence(state, "publish-content", "facebook", { receiptUrl: "https://example.test/r", note: "โพสต์แล้ว" }, "later").contents[0].schedules[0].manualEvidence?.receiptUrl).toBe("https://example.test/r");
  });
});
