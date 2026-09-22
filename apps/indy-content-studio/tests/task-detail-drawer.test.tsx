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
  category: "รีวิว",
  format: "Reels",
  owner: "ฟิว",
  objective: "เพิ่มยอดเข้าชม",
  caption: "แคปชันตัวอย่าง",
  notes: "ใช้ฉบับที่อนุมัติแล้ว",
  assets: [{ name: "review-reels.mp4", type: "video/mp4", size: 5, remoteReady: true, previewReady: true }],
};
const connectionProps = { connectionStatus: "connected" as const, authenticatedAdmin: true };

describe("TaskDetailDrawer", () => {
  it("keeps the selected task workflow available in an accessible detail dialog", () => {
    const close = vi.fn();
    const requestSend = vi.fn();

    render(<TaskDetailDrawer {...connectionProps} task={task} onClose={close} onRequestSend={requestSend} />);

    const drawer = screen.getByRole("dialog", { name: "รายละเอียด ตัดต่อคลิป Reels" });
    expect(drawer).toBeVisible();
    expect(drawer).toHaveClass("motion-material-surface", "motion-drawer");
    expect(screen.getByText("ตัดต่อ")).toBeVisible();
    expect(screen.getByText("10:30")).toBeVisible();
    expect(screen.getByText("review-reels.mp4")).toBeVisible();
    expect(screen.getByText("แคปชันตัวอย่าง")).toBeVisible();
    expect(screen.getByText("ฟิว · Reels · รีวิว")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "ส่งเข้า LINE OA" }));
    expect(requestSend).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียดงาน" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not render without a selected task", () => {
    render(<TaskDetailDrawer {...connectionProps} task={null} onClose={vi.fn()} onRequestSend={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps LINE delivery disabled and cannot request confirmation when the saved task is ineligible", () => {
    const requestSend = vi.fn();

    render(<TaskDetailDrawer {...connectionProps} task={{ ...task, assets: [], caption: "" }} onClose={vi.fn()} onRequestSend={requestSend} />);

    const send = screen.getByRole("button", { name: "ส่งเข้า LINE OA" });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(requestSend).not.toHaveBeenCalled();
  });

  it("disables the LINE send action until the recipient is paired", () => {
    render(
      <TaskDetailDrawer
        {...connectionProps}
        connectionStatus="not_connected"
        task={task}
        onClose={vi.fn()}
        onRequestSend={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "ส่งเข้า LINE OA" })).toBeDisabled();
    expect(screen.getByText(/จับคู่ LINE OA/)).toBeVisible();
  });
});
