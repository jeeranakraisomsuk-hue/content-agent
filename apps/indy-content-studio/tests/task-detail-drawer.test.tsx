import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskDetailDrawer } from "../features/dashboard/components/TaskDetailDrawer";
import type { DashboardTask } from "../features/dashboard/dashboard-model";

const task: DashboardTask = {
  id: "reels",
  title: "ตัดต่อคลิป Reels",
  priority: "urgent",
  scheduledTime: "10:30",
  workflowStage: "ตัดต่อ",
};

describe("TaskDetailDrawer", () => {
  it("keeps the selected task workflow available in an accessible detail dialog", () => {
    const close = vi.fn();
    const requestSend = vi.fn();

    render(<TaskDetailDrawer task={task} onClose={close} onRequestSend={requestSend} />);

    expect(screen.getByRole("dialog", { name: "รายละเอียด ตัดต่อคลิป Reels" })).toBeVisible();
    expect(screen.getByText("ตัดต่อ")).toBeVisible();
    expect(screen.getByText("10:30")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "ส่งเข้า LINE OA" }));
    expect(requestSend).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียดงาน" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not render without a selected task", () => {
    render(<TaskDetailDrawer task={null} onClose={vi.fn()} onRequestSend={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
