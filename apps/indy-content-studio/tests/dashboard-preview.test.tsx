import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPreview } from "../features/dashboard/components/DashboardPreview";

describe("DashboardPreview", () => {
  it("combines the existing overview, work list, production board, and LINE send surface", () => {
    render(<DashboardPreview />);

    expect(screen.getByRole("heading", { name: "ภาพรวมและเป้าหมาย" })).toBeVisible();
    expect(screen.getByRole("heading", { name: /ชิ้นงานในเดือนนี้/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "บอร์ดการผลิต" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ส่งเข้า LINE OA" })).toBeDisabled();
  });
});
