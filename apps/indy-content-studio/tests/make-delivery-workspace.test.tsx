import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { MakeDeliveryWorkspace } from "../features/publication/components/MakeDeliveryWorkspace";

function content(): ContentItem { const now = "2026-09-18T10:00:00.000Z"; return { id: "make-content", title: "โพสต์ Make", categoryId: "cat", formatId: "format", owner: "ทีม", objective: "sales", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: "2026-09-18", productionStatus: "ready", assetIds: [], processSteps: [], caption: "พร้อม", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: null, latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: "cycle", reviewCode: "R-ABC234", providerReceipts: [], lastEventAt: now, history: [] }, createdAt: now, updatedAt: now, deletedAt: null }; }

describe("MakeDeliveryWorkspace", () => {
  it("creates a local publication queue", async () => {
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [content()] });
    render(<DashboardDataProvider repository={repository}><MakeDeliveryWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("คอนเทนต์สำหรับเผยแพร่"), { target: { value: "make-content" } });
    fireEvent.change(screen.getByLabelText("เวลาส่งโพสต์"), { target: { value: "2026-09-20T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "วางแผนเผยแพร่" }));
    expect(await screen.findByText(/โพสต์ Make/)).toBeVisible();
    expect((await repository.read()).publicationAttempts).toHaveLength(1);
  });
});
