import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { ContentCalendarWorkspace } from "../features/calendar/components/ContentCalendarWorkspace";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

describe("calendar workspace", () => {
  it("shows month grid and unscheduled area", async () => {
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    expect(await screen.findByLabelText("เดือนปฏิทิน")).toBeVisible();
    expect(screen.getByText("ยังไม่กำหนดวัน")).toBeVisible();
  });

  it("moves the visible calendar month across year boundaries", async () => {
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    const monthInput = await screen.findByLabelText("เดือนปฏิทิน");
    fireEvent.change(monthInput, { target: { value: "2027-01" } });
    fireEvent.click(screen.getByRole("button", { name: "เดือนก่อนหน้า" }));
    expect(monthInput).toHaveValue("2026-12");
    fireEvent.click(screen.getByRole("button", { name: "เดือนถัดไป" }));
    expect(monthInput).toHaveValue("2027-01");
  });

  it("delegates create-task clicks to the existing creation flow", async () => {
    const onCreateTask = vi.fn();
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={onCreateTask} /></DashboardDataProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "สร้างชิ้นงานใหม่" }));

    expect(onCreateTask).toHaveBeenCalledOnce();
  });

  it("passes the clicked blank date into the create flow", async () => {
    const onCreateTask = vi.fn();
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={onCreateTask} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(screen.getByRole("gridcell", { name: "2026-09-18" }));
    expect(onCreateTask).toHaveBeenCalledWith("2026-09-18");
  });

  it("shows the platform filter and scheduled time on calendar events", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({
      id: "calendar-platform", title: "คลิปตามเวลา", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "พร้อม", captionSource: null,
      schedules: [{ platform: "instagram", enabled: true, publishAt: "2026-09-18T12:15:00+07:00", latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    });
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    expect(screen.getByLabelText("กรองช่องทาง")).toBeVisible();
    expect(await screen.findByText("Instagram · 12:15")).toBeVisible();
  });

  it("opens the selected calendar card in the full content editor", async () => {
    const state = createEmptyDashboardState();
    const item: ContentItem = {
      id: "calendar-card", title: "แก้ผ่านปฏิทิน", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม",
      objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null,
      productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
      referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    };
    state.contents.push(item);
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(await screen.findByRole("button", { name: /แก้ผ่านปฏิทิน/ }));

    expect(await screen.findByRole("dialog", { name: "แก้ไขคอนเทนต์" })).toBeVisible();
    expect(screen.getByLabelText("วันที่ลงในปฏิทิน")).toHaveValue("2026-09-24");
  });

  it("colors unstarted, in-progress, and sent content red, yellow, and green", async () => {
    const state = createEmptyDashboardState();
    const base: ContentItem = {
      id: "", title: "", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
      referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    };
    state.contents.push(
      { ...base, id: "red", title: "ยังไม่ได้ทำ" },
      { ...base, id: "yellow", title: "กำลังทำ", productionStatus: "editing" },
      { ...base, id: "green", title: "ส่งแล้ว", productionStatus: "published" },
    );
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });

    expect(await screen.findByRole("button", { name: /ยังไม่ได้ทำ/ })).toHaveClass("calendar-item--not-started");
    expect(screen.getByRole("button", { name: /กำลังทำ/ })).toHaveClass("calendar-item--in-progress");
    expect(screen.getByRole("button", { name: /ส่งแล้ว/ })).toHaveClass("calendar-item--sent");
    expect(screen.getByRole("button", { name: /ยังไม่ได้ทำ/ }).querySelector("button")).toBeNull();
  });

  it("selects multiple calendar content items and deletes them after confirmation", async () => {
    const state = createEmptyDashboardState();
    const base: ContentItem = {
      id: "", title: "", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
      referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
    };
    state.contents.push(
      { ...base, id: "select-one", title: "เลือกงานหนึ่ง" },
      { ...base, id: "select-two", title: "เลือกงานสอง" },
    );
    const repository = new MemoryDashboardRepository(state);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DashboardDataProvider repository={repository}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "เลือก เลือกงานหนึ่ง" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "เลือก เลือกงานสอง" }));

    expect(screen.getByText("เลือกแล้ว 2 รายการ")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ลบรายการที่เลือก" }));

    await vi.waitFor(async () => {
      const persisted = await repository.read();
      expect(persisted.contents.every((content) => content.deletedAt)).toBe(true);
    });
    expect(screen.queryByText("เลือกงานหนึ่ง")).not.toBeInTheDocument();
    expect(screen.queryByText("เลือกงานสอง")).not.toBeInTheDocument();
  });

  it("keeps the editor action available when a calendar item is not selected", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({
      id: "edit-after-select", title: "เปิดรายละเอียดได้", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม",
      objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-24", lastWorkedAt: null, readyDate: null,
      productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    });
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);

    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    fireEvent.click(await screen.findByRole("button", { name: /เปิดรายละเอียดได้/ }));

    expect(await screen.findByRole("dialog", { name: "แก้ไขคอนเทนต์" })).toBeVisible();
  });
});
