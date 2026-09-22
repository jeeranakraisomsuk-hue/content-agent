import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "../app/home-page-view";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

afterEach(() => vi.unstubAllGlobals());

function seededRepository() {
  const now = "2026-09-18T10:00:00.000Z";
  const content: ContentItem = { id: "reels", title: "ตัดต่อคลิป Reels เทคนิคทรงผม", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีมคอนเทนต์", objective: "awareness", priority: "urgent", plannedWorkAt: "10:30", lastWorkedAt: now, readyDate: null, productionStatus: "editing", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
  return new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [content] });
}

function sendableRepository() {
  const now = "2026-09-22T12:00:00.000Z";
  const content: ContentItem = { id: "sendable-post", title: "พร้อมส่งโพสต์", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีมคอนเทนต์", objective: "awareness", priority: "urgent", plannedWorkAt: "10:30", lastWorkedAt: now, readyDate: null, productionStatus: "ready", assetIds: ["ready-image"], processSteps: [], caption: "แคปชันจากข้อมูลจริง", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
  const repository = new MemoryDashboardRepository({
    ...createEmptyDashboardState(),
    contents: [content],
    media: [{ id: "ready-image", name: "cover.jpg", mimeType: "image/jpeg", size: 1200, source: "upload", externalUrl: null, externalPreviewUrl: null, blobKey: "cover.jpg", remoteStatus: "ready", providerFileId: "drive-cover", previewProviderFileId: null, tags: [], createdAt: now, updatedAt: now, deletedAt: null }],
  });
  return { repository, content };
}

describe("HomePage", () => {
  it("keeps Today as the only page heading and exposes the selected task continuation", async () => {
    render(<HomePage repository={seededRepository()} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    fireEvent.click(await screen.findByRole("button", { name: /ตัดต่อคลิป Reels เทคนิคทรงผม/ }));

    expect(screen.getByRole("region", { name: "ทำงานต่อกับ ตัดต่อคลิป Reels เทคนิคทรงผม" })).toBeVisible();
    expect(screen.getByText("ขั้นตอนปัจจุบัน: ตัดต่อ")).toBeVisible();
    expect(screen.getByRole("button", { name: "ดำเนินงานต่อที่ขั้นตอน ตัดต่อ" })).toBeVisible();
  });

  it("keeps newly created task details and assets available in its drawer", () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);
    const asset = new File(["image"], "cover.jpg", { type: "image/jpeg" });

    fireEvent.click(screen.getByRole("button", { name: "สร้างชิ้นงานใหม่" }));
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "รีวิวสินค้าใหม่" } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "พร้อมเผยแพร่" } });
    fireEvent.change(screen.getByLabelText("กำหนดเวลา"), { target: { value: "2026-09-18T14:30" } });
    fireEvent.change(screen.getByLabelText("ไฟล์แนบ"), { target: { files: [asset] } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    const drawer = screen.getByRole("dialog", { name: "รายละเอียด รีวิวสินค้าใหม่" });
    expect(drawer).toBeVisible();
    expect(within(drawer).getByText("cover.jpg")).toBeVisible();
    expect(within(drawer).getByText("พร้อมเผยแพร่")).toBeVisible();
    expect(within(drawer).getByText("2026-09-18T14:30")).toBeVisible();
  });

  it("opens the working calendar workspace from the rail", async () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" }));

    expect(await screen.findByLabelText("เดือนปฏิทิน")).toBeVisible();
    expect(screen.getByRole("heading", { name: "ปฏิทินคอนเทนต์" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" })).toHaveAttribute("aria-current", "page");
  });

  it("sends only the saved content ID and revision, and never marks a review sent locally", async () => {
    const { repository, content } = sendableRepository();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/line/pairing") return Response.json({ status: "connected", maskedRecipient: "••••cdef", pairedAt: content.updatedAt });
      if (url === "/api/line/send") return Response.json({ delivery: { id: "00000000-0000-4000-8000-000000000001", status: "sent", sentAt: "2026-09-22T12:01:00.000Z", errorCategory: null } });
      throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<HomePage repository={repository} />);
    fireEvent.click(await screen.findByRole("button", { name: /พร้อมส่งโพสต์/ }));
    fireEvent.click(screen.getByRole("button", { name: "ส่งเข้า LINE OA" }));
    expect(await screen.findByText("••••cdef")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/line/send", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId: content.id, expectedUpdatedAt: content.updatedAt }),
    })));
    expect(await screen.findByText(/delivery ID.*00000000-0000-4000-8000-000000000001/i)).toBeVisible();
    expect((await repository.read()).contents[0].lineReview.status).toBe("not-sent");
  });

  it("shows the existing production board as its own workspace", () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: "บอร์ดการผลิต" }));

    expect(screen.getByRole("heading", { name: "บอร์ดการผลิต" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: "วันนี้" })).not.toBeInTheDocument();
  });
});
