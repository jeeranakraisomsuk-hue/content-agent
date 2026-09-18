import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionTemplatesWorkspace } from "../features/captions/components/CaptionTemplatesWorkspace";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

function draftContent(): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "content-1", title: "โพสต์เปิดคอร์ส", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "ก่อนใช้แม่แบบ", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
}

describe("CaptionTemplatesWorkspace", () => {
  it("creates, renames, versions, previews missing values, and copies rendered text", async () => {
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboard } });
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><CaptionTemplatesWorkspace /></DashboardDataProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มแม่แบบ" }));
    fireEvent.change(screen.getByLabelText("ชื่อแม่แบบ"), { target: { value: "เปิดคอร์ส" } });
    fireEvent.change(screen.getByLabelText("เนื้อหาแม่แบบ"), { target: { value: "สมัคร {course} ภายใน {date}" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแม่แบบ" }));
    expect(await screen.findByText("เปิดคอร์ส")).toBeVisible();
    expect(screen.getByText("เวอร์ชันปัจจุบัน 1")).toBeVisible();
    expect(screen.getByText("ตัวแปร: course, date")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนชื่อ เปิดคอร์ส" }));
    fireEvent.change(screen.getByLabelText("ชื่อแม่แบบ"), { target: { value: "เปิดคอร์สเดือนนี้" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกชื่อ" }));
    expect(await screen.findByText("เปิดคอร์สเดือนนี้")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "สร้างเวอร์ชันใหม่ เปิดคอร์สเดือนนี้" }));
    fireEvent.change(screen.getByLabelText("เนื้อหาเวอร์ชันใหม่"), { target: { value: "เรียน {course} เริ่ม {date}" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกเวอร์ชันใหม่" }));
    expect(await screen.findByText("เวอร์ชันปัจจุบัน 2")).toBeVisible();
    expect(screen.getByText("ประวัติเวอร์ชัน")).toBeVisible();
    expect(screen.getByText("เวอร์ชัน 1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่าง เปิดคอร์สเดือนนี้" }));
    expect(screen.getByRole("dialog", { name: "ตัวอย่างแคปชั่น" })).toBeVisible();
    expect(screen.getByText("ยังขาดค่า: course, date")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "ตัวอย่างแคปชั่น" })).toHaveTextContent("เรียน {course} เริ่ม {date}");
    fireEvent.change(screen.getByLabelText("course"), { target: { value: "ตัดผม" } });
    fireEvent.change(screen.getByLabelText("date"), { target: { value: "20 ก.ย." } });
    fireEvent.click(screen.getByRole("button", { name: "คัดลอกแคปชั่น" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith("เรียน ตัดผม เริ่ม 20 ก.ย."));
  });

  it("applies an immutable rendered caption snapshot to the selected content draft", async () => {
    const state = createEmptyDashboardState();
    state.contents.push(draftContent());
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><CaptionTemplatesWorkspace /></DashboardDataProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มแม่แบบ" }));
    fireEvent.change(screen.getByLabelText("ชื่อแม่แบบ"), { target: { value: "ชวนสมัคร" } });
    fireEvent.change(screen.getByLabelText("เนื้อหาแม่แบบ"), { target: { value: "สมัคร {course}" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแม่แบบ" }));
    await screen.findByText("ชวนสมัคร");

    fireEvent.click(screen.getByRole("button", { name: "ดูตัวอย่าง ชวนสมัคร" }));
    fireEvent.change(screen.getByLabelText("course"), { target: { value: "ตัดผม" } });
    fireEvent.change(screen.getByLabelText("เลือกคอนเทนต์ที่จะใช้"), { target: { value: "content-1" } });
    fireEvent.click(screen.getByRole("button", { name: "ใช้กับคอนเทนต์" }));
    await waitFor(async () => expect((await repository.read()).contents[0]).toMatchObject({ caption: "สมัคร ตัดผม", captionSource: { values: { course: "ตัดผม" } } }));

    fireEvent.click(screen.getByRole("button", { name: "สร้างเวอร์ชันใหม่ ชวนสมัคร" }));
    fireEvent.change(screen.getByLabelText("เนื้อหาเวอร์ชันใหม่"), { target: { value: "ข้อความใหม่ {course}" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกเวอร์ชันใหม่" }));
    expect((await repository.read()).contents[0].caption).toBe("สมัคร ตัดผม");
    expect((await repository.read()).contents[0].captionSource?.versionId).toContain("v1");
  });
});
