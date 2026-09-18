import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "../app/page";

describe("HomePage", () => {
  it("keeps Today as the only page heading and exposes the selected task continuation", () => {
    render(<HomePage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /ตัดต่อคลิป Reels เทคนิคทรงผม/ }));

    expect(screen.getByRole("region", { name: "ทำงานต่อกับ ตัดต่อคลิป Reels เทคนิคทรงผม" })).toBeVisible();
    expect(screen.getByText("ขั้นตอนปัจจุบัน: ตัดต่อ")).toBeVisible();
    expect(screen.getByRole("button", { name: "ดำเนินงานต่อที่ขั้นตอน ตัดต่อ" })).toBeVisible();
  });
});
