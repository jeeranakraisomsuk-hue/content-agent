import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import {
  addCategory,
  addFormat,
  deleteCategory,
  deleteFormat,
  renameCategory,
  renameFormat,
  setCategoryApprovalRequired,
  setMonthlyGoal,
} from "../features/settings/settings-commands";

const meta = { id: "new-item", now: "2026-09-18T00:00:00.000Z" };

describe("settings commands", () => {
  it("adds, renames, and toggles category settings immutably", () => {
    const state = createEmptyDashboardState();
    const added = addCategory(state, " เบื้องหลัง ", meta);
    expect(added).not.toBe(state);
    expect(added.categories.at(-1)).toMatchObject({ id: "new-item", name: "เบื้องหลัง", requiresApproval: false });
    expect(() => addCategory(state, " รีวิว ", meta)).toThrow("มีหมวดนี้อยู่แล้ว");
    const renamed = renameCategory(added, "new-item", " เบื้องหลังทีม ");
    expect(renamed.categories.find((item) => item.id === "new-item")?.name).toBe("เบื้องหลังทีม");
    expect(setCategoryApprovalRequired(renamed, "new-item", true).categories.find((item) => item.id === "new-item")?.requiresApproval).toBe(true);
  });

  it("blocks deleting a category or format that is in use", () => {
    const state = createEmptyDashboardState();
    expect(() => deleteCategory({ ...state, contents: [{
      id: "content-1", title: "งาน", categoryId: "category-review", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    }], }, "category-review")).toThrow("หมวดนี้มีชิ้นงานใช้อยู่");
    expect(() => deleteFormat({ ...state, contents: [{
      id: "content-1", title: "งาน", categoryId: "category-review", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    }], }, "format-video")).toThrow("รูปแบบนี้มีชิ้นงานใช้อยู่");
    expect(deleteCategory(state, "category-review").categories.some((item) => item.id === "category-review")).toBe(false);
  });

  it("manages formats and monthly goals", () => {
    const state = createEmptyDashboardState();
    const added = addFormat(state, " Carousel ", "image", ["facebook"], meta);
    expect(added.formats.at(-1)).toMatchObject({ id: "new-item", name: "Carousel", mediaKind: "image" });
    expect(() => addFormat(state, " วิดีโอ ", "video", ["facebook"], meta)).toThrow("มีรูปแบบนี้อยู่แล้ว");
    const renamed = renameFormat(added, "new-item", "อัลบั้มใหม่");
    expect(renamed.formats.find((item) => item.id === "new-item")?.name).toBe("อัลบั้มใหม่");
    expect(setMonthlyGoal(state, "2026-09", 20).monthlyGoals[0]).toMatchObject({ month: "2026-09", target: 20 });
    expect(() => setMonthlyGoal(state, "2026-09", -1)).toThrow("เป้าหมายต้องไม่ติดลบ");
  });
});
