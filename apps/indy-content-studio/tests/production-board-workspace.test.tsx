import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { ProductionBoardWorkspace } from "../features/production/components/ProductionBoardWorkspace";

function makeContent(): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "production-1", title: "โพสต์พร้อมตรวจ", categoryId: "cat", formatId: "format", owner: "ทีมคอนเทนต์", objective: "awareness", priority: "high", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "review", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: null, latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
}

describe("ProductionBoardWorkspace", () => {
  it("filters and moves a content card between production columns", async () => {
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [makeContent()] });
    render(<DashboardDataProvider repository={repository}><ProductionBoardWorkspace /></DashboardDataProvider>);
    expect(await screen.findByText("โพสต์พร้อมตรวจ")).toBeVisible();
    fireEvent.change(screen.getByLabelText("ย้าย โพสต์พร้อมตรวจ"), { target: { value: "ready" } });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "ย้าย โพสต์พร้อมตรวจ" })).toHaveValue("ready"));
    expect((await repository.read()).contents[0].productionStatus).toBe("ready");
  });

  it("surfaces the evidence rule when moving directly to Published", async () => {
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [makeContent()] });
    render(<DashboardDataProvider repository={repository}><ProductionBoardWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("ย้าย โพสต์พร้อมตรวจ"), { target: { value: "published" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("ยังไม่มีหลักฐานเผยแพร่ครบทุกช่องทาง");
  });
});
