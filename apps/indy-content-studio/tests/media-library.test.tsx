import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { MediaLibraryWorkspace } from "../features/media/components/MediaLibraryWorkspace";
import type { MediaBlobStore } from "../features/media/media-blob-store";

class TestBlobStore implements MediaBlobStore {
  private readonly blobs = new Map<string, Blob>();
  async put(id: string, blob: Blob) { this.blobs.set(id, blob); }
  async get(id: string) { return this.blobs.get(id) ?? null; }
  async remove(id: string) { this.blobs.delete(id); }
}

function renderLibrary() {
  return render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><MediaLibraryWorkspace blobStore={new TestBlobStore()} /></DashboardDataProvider>);
}

describe("MediaLibraryWorkspace", () => {
  it("uploads media, moves it to trash, and restores it", async () => {
    renderLibrary();
    const file = new File(["image"], "ผลงาน.jpg", { type: "image/jpeg" });
    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [file] } });
    expect(await screen.findByText("ผลงาน.jpg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ย้าย ผลงาน.jpg ไปถังขยะ" }));
    fireEvent.click(screen.getByRole("tab", { name: "ถังขยะ" }));
    expect(await screen.findByText("ผลงาน.jpg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "กู้คืน ผลงาน.jpg" }));
    fireEvent.click(screen.getByRole("tab", { name: "ทั้งหมด" }));
    expect(await screen.findByText("ผลงาน.jpg")).toBeVisible();
  });

  it("adds an external https link and rejects unsafe links", async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลิงก์ภายนอก" }));
    fireEvent.change(screen.getByLabelText("ชื่อสื่อภายนอก"), { target: { value: "คลิปอ้างอิง" } });
    fireEvent.change(screen.getByLabelText("ลิงก์สื่อ"), { target: { value: "https://example.com/video.mp4" } });
    fireEvent.change(screen.getByLabelText("ลิงก์ภาพตัวอย่าง"), { target: { value: "https://example.com/poster.jpg" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกลิงก์" }));
    expect(await screen.findByText("คลิปอ้างอิง")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มลิงก์ภายนอก" }));
    fireEvent.change(screen.getByLabelText("ชื่อสื่อภายนอก"), { target: { value: "ไม่ปลอดภัย" } });
    fireEvent.change(screen.getByLabelText("ลิงก์สื่อ"), { target: { value: "http://unsafe.test/video.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกลิงก์" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ต้องเป็นลิงก์ https");
  });
});
