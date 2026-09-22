import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { CorrectionsWorkspace } from "../features/line-oa/components/CorrectionsWorkspace";

afterEach(() => vi.unstubAllGlobals());
type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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

  it("shows paired status and sends review identifiers only, without a manual LINE ID or browser-built messages", async () => {
    const content = makeContent();
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [content] });
    const fetcher = vi.fn<TestFetcher>(async (input, init) => {
      const url = String(input);
      if (url === "/api/line/pairing") return Response.json({ status: "connected", maskedRecipient: "••••cdef", pairedAt: content.updatedAt });
      if (url === "/api/line/send-review") return Response.json({ status: "sent", reviewCode: "R-ABC234" });
      throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<DashboardDataProvider repository={repository}><CorrectionsWorkspace /></DashboardDataProvider>);

    expect(await screen.findByText(/เชื่อมต่อ LINE แล้ว/)).toHaveTextContent("••••cdef");
    expect(screen.queryByLabelText("LINE User ID")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "เริ่มรอบตรวจ" }));
    fireEvent.click(await screen.findByRole("button", { name: "ส่งตรวจผ่าน LINE" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/line/send-review", expect.objectContaining({
      method: "POST",
      body: expect.any(String),
    })));
    const sendCall = fetcher.mock.calls.find(([input]) => String(input) === "/api/line/send-review");
    expect(JSON.parse(String(sendCall?.[1]?.body))).toEqual({
      contentId: content.id,
      cycleId: expect.any(String),
      reviewCode: expect.any(String),
    });
    expect(await screen.findByText("ส่งรอบตรวจไปยัง LINE ที่จับคู่ไว้แล้ว")).toBeVisible();
    expect(screen.getByRole("button", { name: "ส่งตรวจผ่าน LINE" })).toBeDisabled();
  });

  it("generates an in-app pairing code and instructions when LINE is not connected", async () => {
    const fetcher = vi.fn<TestFetcher>(async (input, init) => {
      const url = String(input);
      if (url === "/api/line/pairing" && !init?.method) return Response.json({ status: "not_connected", maskedRecipient: null, pairedAt: null });
      if (url === "/api/line/pairing" && init?.method === "POST") return Response.json({ pairingCode: "INDY-AB12CD34-EF56AB78", expiresAt: "2026-09-22T12:10:00.000Z", connection: { status: "pairing" } });
      throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><CorrectionsWorkspace /></DashboardDataProvider>);

    expect(await screen.findByText(/ยังไม่ได้จับคู่ LINE/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "สร้างรหัสจับคู่" }));
    expect(await screen.findByText("เชื่อมต่อ INDY-AB12CD34-EF56AB78")).toBeVisible();
    expect(screen.getByText(/ส่งข้อความนี้ให้ LINE OA/)).toBeVisible();
  });
});
