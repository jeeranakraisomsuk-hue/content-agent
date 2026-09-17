import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentEditor } from "../features/content/components/ContentEditor";

describe("ContentEditor", () => {
  it("disables the LINE action until asset and caption are ready", () => {
    render(<ContentEditor assetState="missing" caption="ข้อความ" />);
    expect(screen.getByRole("button", { name: "ส่งเข้า LINE OA" })).toBeDisabled();
  });

  it("enables the LINE action when asset and caption are ready", () => {
    render(<ContentEditor assetState="ready" caption="ข้อความ" />);
    expect(screen.getByRole("button", { name: "ส่งเข้า LINE OA" })).toBeEnabled();
  });

  it("shows PRIK GN as the dedicated LINE recipient", () => {
    render(<ContentEditor assetState="ready" caption="ข้อความ" />);
    expect(screen.getByText("ปลายทาง LINE: PRIK GN")).toBeInTheDocument();
  });
});
