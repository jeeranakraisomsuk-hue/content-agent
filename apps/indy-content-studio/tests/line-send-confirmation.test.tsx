import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineSendConfirmation } from "../features/dashboard/components/LineSendConfirmation";
import type { DashboardTask } from "../features/dashboard/dashboard-model";

const readyTask: DashboardTask = {
  id: "reels",
  title: "ตัดต่อคลิป Reels",
  priority: "urgent",
  scheduledTime: "10:30",
  caption: "แคปชันตัวอย่าง",
  assets: [{ name: "review-reels.mp4", type: "video/mp4", size: 5 }],
};

describe("LineSendConfirmation", () => {
  it("shows the selected saved asset, caption, and intended recipient before confirming", () => {
    const confirm = vi.fn().mockResolvedValue(undefined);

    render(<LineSendConfirmation task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    expect(screen.getByRole("dialog", { name: "ยืนยันการส่งเข้า LINE OA" })).toBeVisible();
    expect(screen.getByText("review-reels.mp4")).toBeVisible();
    expect(screen.getByText("แคปชันตัวอย่าง")).toBeVisible();
    expect(screen.getByText("PRIK GN")).toBeVisible();
    expect(screen.getByRole("button", { name: "ยกเลิก" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("prevents a second confirmation while the first submission is pending", () => {
    let resolveConfirmation: (() => void) | undefined;
    const confirm = vi.fn(() => new Promise<void>((resolve) => { resolveConfirmation = resolve; }));

    render(<LineSendConfirmation task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    const submit = screen.getByRole("button", { name: "ยืนยันส่ง" });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(confirm).toHaveBeenCalledOnce();
    resolveConfirmation?.();
  });

  it("shows a receipt after success", async () => {
    render(<LineSendConfirmation task={readyTask} open onCancel={vi.fn()} onConfirm={vi.fn().mockResolvedValue(undefined)} />);

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));

    expect(await screen.findByRole("status")).toHaveTextContent("ส่งเข้า LINE OA เรียบร้อยแล้ว");
  });

  it("offers a safe retry after a failed delivery", async () => {
    const confirm = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);

    render(<LineSendConfirmation task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ส่งไม่สำเร็จ");
    fireEvent.click(screen.getByRole("button", { name: "ลองส่งอีกครั้ง" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("ส่งเข้า LINE OA เรียบร้อยแล้ว");
  });

  it("does not open for a task without both a ready asset and caption", () => {
    render(<LineSendConfirmation task={{ ...readyTask, assets: [], caption: "" }} open onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.queryByRole("dialog", { name: "ยืนยันการส่งเข้า LINE OA" })).not.toBeInTheDocument();
  });
});
