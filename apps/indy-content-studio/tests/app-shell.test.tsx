import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../app/AppShell";

describe("AppShell", () => {
  it("renders the live dashboard navigation labels", () => {
    render(
      <AppShell>
        <main>content</main>
      </AppShell>,
    );

    expect(
      screen.getByRole("button", { name: "ภาพรวมและเป้าหมาย" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "บอร์ดการผลิต" })).toBeVisible();
  });
});
