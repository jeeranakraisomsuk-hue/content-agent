import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider, useDashboardData } from "../features/data/DashboardDataProvider";
import { upsertContent } from "../features/data/dashboard-commands";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import type { ContentItem } from "../features/domain/types";

const contentFixture = (id: string): ContentItem => ({
  id,
  title: `งาน ${id}`,
  categoryId: "category-knowledge",
  formatId: "format-video",
  owner: "ทีมคอนเทนต์",
  objective: "awareness",
  priority: "normal",
  plannedWorkAt: null,
  lastWorkedAt: null,
  readyDate: null,
  productionStatus: "waiting-shoot",
  assetIds: [],
  processSteps: [],
  caption: "",
  captionSource: null,
  schedules: [],
  referenceIds: [],
  notes: "",
  localApproval: "pending",
  lineReview: {
    status: "not-sent",
    activeCycleId: null,
    reviewCode: null,
    providerReceipts: [],
    lastEventAt: null,
    history: [],
  },
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
  deletedAt: null,
});

function Probe() {
  const { error, mutate, reload, state, status } = useDashboardData();

  if (status === "loading") return <p>กำลังโหลดข้อมูล</p>;
  if (status === "error") {
    return <><p role="alert">โหลดข้อมูลไม่สำเร็จ</p><button onClick={() => void reload()}>ลองใหม่</button></>;
  }

  return (
    <>
      <p>พร้อมใช้งาน</p>
      <p>{state?.contents.map((item) => item.id).join(",")}</p>
      {error && <p role="alert">{error.message}</p>}
      <button onClick={() => void mutate((current) => upsertContent(current, contentFixture("one")))}>เพิ่มชิ้นงาน</button>
      <button onClick={() => {
        void mutate((current) => upsertContent(current, contentFixture("two")));
        void mutate((current) => upsertContent(current, contentFixture("three")));
      }}>เพิ่มสองชิ้นงาน</button>
    </>
  );
}

describe("DashboardDataProvider", () => {
  it("loads, persists a mutation, and serializes rapid mutations", async () => {
    const repository = new MemoryDashboardRepository();
    render(<DashboardDataProvider repository={repository}><Probe /></DashboardDataProvider>);

    expect(await screen.findByText("พร้อมใช้งาน")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มชิ้นงาน" }));
    expect(await screen.findByText("one")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มสองชิ้นงาน" }));

    await waitFor(async () => {
      expect((await repository.read()).contents.map((item) => item.id)).toEqual(["one", "two", "three"]);
    });
  });

  it("exposes a retryable error when the repository cannot load", async () => {
    const repository = new MemoryDashboardRepository();
    repository.read = async () => { throw new Error("โหลดไม่ได้"); };

    render(<DashboardDataProvider repository={repository}><Probe /></DashboardDataProvider>);

    expect(await screen.findByRole("alert")).toHaveTextContent("โหลดข้อมูลไม่สำเร็จ");
  });
});
