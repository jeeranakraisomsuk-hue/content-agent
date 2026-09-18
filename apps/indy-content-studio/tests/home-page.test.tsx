import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePage } from "../app/home-page-view";

describe("HomePage", () => {
  it("keeps Today as the only page heading and exposes the selected task continuation", () => {
    render(<HomePage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /ตัดต่อคลิป Reels เทคนิคทรงผม/ }));

    expect(screen.getByRole("region", { name: "ทำงานต่อกับ ตัดต่อคลิป Reels เทคนิคทรงผม" })).toBeVisible();
    expect(screen.getByText("ขั้นตอนปัจจุบัน: ตัดต่อ")).toBeVisible();
    expect(screen.getByRole("button", { name: "ดำเนินงานต่อที่ขั้นตอน ตัดต่อ" })).toBeVisible();
  });

  it("keeps newly created task details and assets available in its drawer", () => {
    render(<HomePage />);
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

  it("opens a clear deferred workspace when a rail destination has no existing surface", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" }));

    expect(screen.getByRole("heading", { name: "ปฏิทินคอนเทนต์" })).toBeVisible();
    expect(screen.getByText("กำลังจัดเตรียมพื้นที่งานนี้")).toBeVisible();
    expect(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the existing production board as its own workspace", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "บอร์ดการผลิต" }));

    expect(screen.getByRole("heading", { name: "บอร์ดการผลิต" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: "วันนี้" })).not.toBeInTheDocument();
  });
});
