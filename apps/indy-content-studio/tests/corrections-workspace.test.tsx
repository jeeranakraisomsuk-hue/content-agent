import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { CorrectionsWorkspace } from "../features/line-oa/components/CorrectionsWorkspace";

function makeContent(): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "line-content", title: "โพสต์เปิดคอร์ส", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "สมัครวันนี้", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
}

describe("CorrectionsWorkspace", () => {
  it("starts a review cycle and resolves an open correction", async () => {
    const content = makeContent();
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [content], corrections: [{ id: "correction-1", contentId: content.id, cycleId: "cycle-old", comment: "เพิ่มราคา", status: "open", receivedAt: "now", resolvedAt: null }] });
    render(<DashboardDataProvider repository={repository}><CorrectionsWorkspace /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "เริ่มรอบตรวจ" }));
    expect(await screen.findByText(/รหัสรอบตรวจ:/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "รับทราบและเตรียมรอบใหม่" }));
    expect(await screen.findByText("ยังไม่มีงานที่ต้องแก้")).toBeVisible();
  });
});
