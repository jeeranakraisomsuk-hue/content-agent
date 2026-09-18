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

  it("emits the task details without initiating delivery", () => {
    const create = vi.fn();

    render(<CreateContentModal open onClose={vi.fn()} onCreate={create} />);
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "รีวิวสินค้า" } });
    fireEvent.change(screen.getByLabelText("หมวดหมู่"), { target: { value: "รีวิว" } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "แคปชันตัวอย่าง" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      title: "รีวิวสินค้า",
      category: "รีวิว",
      caption: "แคปชันตัวอย่าง",
    }));
    expect(screen.queryByText("ยืนยันส่ง")).not.toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CreateContentModal open={false} onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
