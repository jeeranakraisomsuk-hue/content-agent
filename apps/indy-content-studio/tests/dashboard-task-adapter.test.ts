import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import {
  dashboardTaskFromContent,
  dashboardTaskToContent,
  dashboardTaskToMedia,
} from "../features/dashboard/dashboard-model";
import type { DashboardTask } from "../features/dashboard/dashboard-model";

const taskFixture: DashboardTask = {
  id: "task-adapter",
  title: "รีวิวสินค้า",
  priority: "high",
  scheduledTime: "2026-09-18T14:30",
  workflowStage: "ตัดต่อ",
  category: "รีวิว",
  format: "วิดีโอ",
  owner: "ทีมวิดีโอ",
  objective: "awareness",
  caption: "แคปชั่น",
  notes: "โน้ต",
  assets: [{ name: "clip.mp4", type: "video/mp4", size: 10 }],
};

describe("dashboard task adapter", () => {
  it("maps a dashboard task into canonical content and media records", () => {
    const state = createEmptyDashboardState();
    const content = dashboardTaskToContent(taskFixture, state, "2026-09-18T08:00:00.000Z");
    const media = dashboardTaskToMedia(taskFixture, "2026-09-18T08:00:00.000Z");

    expect(content).toMatchObject({
      id: "task-adapter",
      categoryId: "category-review",
      formatId: "format-video",
      productionStatus: "editing",
      priority: "high",
      plannedWorkAt: "2026-09-18T14:30",
      caption: "แคปชั่น",
    });
    expect(content.assetIds).toEqual(["asset-task-adapter-0"]);
    expect(media[0]).toMatchObject({ id: "asset-task-adapter-0", name: "clip.mp4", remoteStatus: "local-only" });
  });

  it("maps canonical content back to the task shape used by Today", () => {
    const state = createEmptyDashboardState();
    const content = dashboardTaskToContent(taskFixture, state, "2026-09-18T08:00:00.000Z");
    const nextState = { ...state, contents: [content], media: dashboardTaskToMedia(taskFixture, "2026-09-18T08:00:00.000Z") };

    expect(dashboardTaskFromContent(content, nextState)).toMatchObject({
      id: "task-adapter",
      title: "รีวิวสินค้า",
      scheduledTime: "2026-09-18T14:30",
      workflowStage: "ตัดต่อ",
      assets: [{ name: "clip.mp4", type: "video/mp4", size: 10 }],
    });
  });
});
