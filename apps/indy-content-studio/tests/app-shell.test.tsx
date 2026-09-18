import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../app/AppShell";

describe("AppShell", () => {
  it("exposes labelled rail navigation and a workspace search field", () => {
    render(
      <AppShell>
        <main>content</main>
      </AppShell>,
    );

    expect(
      screen.getByRole("button", { name: "ภาพรวมและเป้าหมาย" }),
    ).toHaveAttribute("data-tooltip", "ภาพรวมและเป้าหมาย");
    expect(screen.getByRole("button", { name: "บอร์ดการผลิต" })).toBeVisible();
    expect(
      screen.getByPlaceholderText("ค้นหาไฟล์ งาน หรือไอเดีย"),
    ).toBeVisible();
  });
});
