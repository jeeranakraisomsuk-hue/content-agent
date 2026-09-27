import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentEditorDialog } from "../features/content/components/ContentEditorDialog";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

const source: ContentItem = {
  id: "content-original", title: "คอนเทนต์เดิม", categoryId: "category-knowledge", formatId: "format-video",
  owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-24", lastWorkedAt: null,
  readyDate: "2026-09-25", productionStatus: "waiting-shoot", assetIds: [], processSteps: [{ id: "step-1", name: "ตัดต่อ", scheduledDate: null, status: "todo", order: 0 }], caption: "แคปชันเดิม",
  captionSource: null, schedules: [], referenceIds: [], notes: "โน้ตเดิม", localApproval: "pending",
  lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
};

function renderEditor() {
  const state = createEmptyDashboardState();
  state.contents.push(source);
  const repository = new MemoryDashboardRepository(state);
  const view = render(<DashboardDataProvider repository={repository}><ContentEditorDialog mode="edit" contentId={source.id} open onClose={() => undefined} /></DashboardDataProvider>);
  return { repository, ...view };
}

describe("full content editor", () => {
  it("uses a date per production step, hides the standalone ready date, and styles recurring copies as a minimal action", async () => {
    const { repository } = renderEditor();
    expect(screen.queryByLabelText("วันที่พร้อมผลิต")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("วันที่ขั้นตอน 1"), { target: { value: "2026-09-26" } });
    expect(screen.getByRole("button", { name: "สร้างสำเนาตามรอบเวลา" })).toHaveClass("editor-repeat-button");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));

    await waitFor(async () => expect((await repository.read()).contents[0].processSteps[0].scheduledDate).toBe("2026-09-26"));
  });

  it("edits the task name, production status, and calendar date", async () => {
    const { repository } = renderEditor();
    fireEvent.change(await screen.findByLabelText("ชื่อคอนเทนต์"), { target: { value: "ชื่อใหม่" } });
    fireEvent.change(screen.getByLabelText("สถานะการผลิต"), { target: { value: "editing" } });
    fireEvent.change(screen.getByLabelText("วันที่ลงในปฏิทิน"), { target: { value: "2026-09-28" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));

    await waitFor(async () => expect((await repository.read()).contents[0]).toMatchObject({ title: "ชื่อใหม่", productionStatus: "editing", plannedWorkAt: "2026-09-28" }));
  });

  it("edits an independent platform schedule", async () => {
    const { repository } = renderEditor();
    fireEvent.click(await screen.findByLabelText("เปิด Facebook"));
    fireEvent.change(screen.getByLabelText("วันลง Facebook"), { target: { value: "2026-09-28" } });
    fireEvent.change(screen.getByLabelText("เวลาลง Facebook"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));

    await waitFor(async () => expect((await repository.read()).contents[0].schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "facebook", enabled: true, publishAt: "2026-09-28T09:30:00+07:00" }),
    ])));
  });

  it("copies and pastes a fresh unsent task", async () => {
    const { repository } = renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "คัดลอกงาน" }));
    fireEvent.click(screen.getByRole("button", { name: "วางเป็นงานใหม่" }));

    await waitFor(async () => expect((await repository.read()).contents).toHaveLength(2));
    const copy = (await repository.read()).contents.find((content) => content.id !== source.id);
    expect(copy).toMatchObject({ title: "คอนเทนต์เดิม (สำเนา)", plannedWorkAt: "2026-09-24", productionStatus: "waiting-shoot", localApproval: "pending" });
    expect(await screen.findByRole("status")).toHaveTextContent("วางสำเนาเป็นงานใหม่แล้ว");
  });

  it("moves the task to recoverable trash only after confirmation", async () => {
    const { repository } = renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "ลบงาน" }));
    expect(screen.getByRole("button", { name: "ยืนยันลบงาน" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบงาน" }));

    await waitFor(async () => expect((await repository.read()).contents[0].deletedAt).toEqual(expect.any(String)));
  });
});
