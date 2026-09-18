import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateContentModal } from "../features/dashboard/components/CreateContentModal";

describe("CreateContentModal", () => {
  it("requires a title before creating a task", () => {
    const create = vi.fn();

    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} />);
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(screen.getByText("กรุณาระบุชื่อชิ้นงาน")).toBeVisible();
    expect(create).not.toHaveBeenCalled();
  });

  it("retains every creation field and selected asset metadata without initiating delivery", () => {
    const create = vi.fn();
    const asset = new File(["video"], "review-reels.mp4", { type: "video/mp4" });

    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} />);
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "รีวิวสินค้า" } });
    fireEvent.change(screen.getByLabelText("หมวดหมู่"), { target: { value: "รีวิว" } });
    fireEvent.change(screen.getByLabelText("รูปแบบ"), { target: { value: "Reels" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "ฟิว" } });
    fireEvent.change(screen.getByLabelText("เป้าหมาย"), { target: { value: "เพิ่มยอดเข้าชม" } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "แคปชันตัวอย่าง" } });
    fireEvent.change(screen.getByLabelText("กำหนดเวลา"), { target: { value: "2026-09-18T14:30" } });
    fireEvent.change(screen.getByLabelText("โน้ต"), { target: { value: "ใช้ฉบับที่อนุมัติแล้ว" } });
    fireEvent.change(screen.getByLabelText("ไฟล์แนบ"), { target: { files: [asset] } });
    expect(screen.getByText("review-reels.mp4")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(create).toHaveBeenCalledWith({
      title: "รีวิวสินค้า",
      category: "รีวิว",
      format: "Reels",
      owner: "ฟิว",
      objective: "เพิ่มยอดเข้าชม",
      caption: "แคปชันตัวอย่าง",
      scheduledTime: "2026-09-18T14:30",
      notes: "ใช้ฉบับที่อนุมัติแล้ว",
      assets: [{ name: "review-reels.mp4", type: "video/mp4", size: 5 }],
    });
    expect(screen.queryByText("ยืนยันส่ง")).not.toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CreateContentModal open={false} onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
