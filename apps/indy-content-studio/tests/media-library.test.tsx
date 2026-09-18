import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { DashboardState } from "../features/domain/types";
import { MediaLibraryWorkspace } from "../features/media/components/MediaLibraryWorkspace";
import type { MediaBlobStore } from "../features/media/media-blob-store";

class TestBlobStore implements MediaBlobStore {
  private readonly blobs = new Map<string, Blob>();
  async put(id: string, blob: Blob) { this.blobs.set(id, blob); }
  async get(id: string) { return this.blobs.get(id) ?? null; }
  async remove(id: string) { this.blobs.delete(id); }
}

function renderLibrary(initialState: DashboardState = createEmptyDashboardState()) {
  const repository = new MemoryDashboardRepository(initialState);
  const blobStore = new TestBlobStore();
  return {
    ...render(<DashboardDataProvider repository={repository}><MediaLibraryWorkspace blobStore={blobStore} /></DashboardDataProvider>),
    blobStore,
    repository,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("keeps the local blob and labels it local-only while Drive is disconnected", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { blobStore, repository } = renderLibrary();
    const file = new File(["image"], "เก็บในเครื่อง.jpg", { type: "image/jpeg" });

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [file] } });

    expect(await screen.findByText("เก็บไว้ในเครื่องนี้เท่านั้น")).toBeVisible();
    const [asset] = (await repository.read()).media;
    expect(asset.remoteStatus).toBe("local-only");
    expect(await blobStore.get(asset.id)).toBe(file);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stores provider identifiers only after Drive confirms the upload", async () => {
    const state = createEmptyDashboardState();
    state.integrations.find(({ provider }) => provider === "google-drive")!.status = "connected";
    let resolveUpload!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveUpload = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const { repository } = renderLibrary(state);

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["image"], "พร้อมส่ง.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("กำลังอัปโหลดไป Google Drive…")).toBeVisible();
    expect(screen.queryByText("พร้อมใช้ผ่าน Google Drive")).not.toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/media/upload", expect.objectContaining({ method: "POST" })));
    const uploadingAsset = (await repository.read()).media[0];
    expect(uploadingAsset).toMatchObject({ remoteStatus: "uploading", providerFileId: null, previewProviderFileId: null });

    resolveUpload(Response.json({
      assetId: uploadingAsset.id,
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
      remoteStatus: "ready",
    }));

    expect(await screen.findByText("พร้อมใช้ผ่าน Google Drive")).toBeVisible();
    expect((await repository.read()).media[0]).toMatchObject({
      remoteStatus: "ready",
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
    });
  });

  it("returns to local-only when the server says Drive is disconnected", async () => {
    const state = createEmptyDashboardState();
    state.integrations.find(({ provider }) => provider === "google-drive")!.status = "connected";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { error: "ยังไม่ได้เชื่อมต่อ Google Drive" },
      { status: 503 },
    )));
    const { blobStore, repository } = renderLibrary(state);

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["image"], "ยังอยู่ในเครื่อง.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("เก็บไว้ในเครื่องนี้เท่านั้น")).toBeVisible();
    const [asset] = (await repository.read()).media;
    expect(asset).toMatchObject({ remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null });
    expect(await blobStore.get(asset.id)).not.toBeNull();
    expect(screen.queryByRole("button", { name: `ลองอัปโหลด ${asset.name} อีกครั้ง` })).not.toBeInTheDocument();
  });

  it("retains a failed local upload and retries without claiming provider success", async () => {
    const state = createEmptyDashboardState();
    state.integrations.find(({ provider }) => provider === "google-drive")!.status = "connected";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "อัปโหลดไป Google Drive ไม่สำเร็จ" }, { status: 502 }));
    vi.stubGlobal("fetch", fetcher);
    const { blobStore, repository } = renderLibrary(state);

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["image"], "ลองใหม่.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("อัปโหลดไป Google Drive ไม่สำเร็จ")).toBeVisible();
    const failedAsset = (await repository.read()).media[0];
    expect(failedAsset.remoteStatus).toBe("failed");
    expect(await blobStore.get(failedAsset.id)).not.toBeNull();
    expect(screen.queryByText(/ส่งแล้ว|เผยแพร่แล้ว/)).not.toBeInTheDocument();

    fetcher.mockResolvedValueOnce(Response.json({
      assetId: failedAsset.id,
      providerFileId: "drive-retry-original",
      previewProviderFileId: "drive-retry-preview",
      remoteStatus: "ready",
    }));
    fireEvent.click(screen.getByRole("button", { name: `ลองอัปโหลด ${failedAsset.name} อีกครั้ง` }));

    expect(await screen.findByText("พร้อมใช้ผ่าน Google Drive")).toBeVisible();
    expect((await repository.read()).media[0]).toMatchObject({ remoteStatus: "ready", providerFileId: "drive-retry-original" });
  });
});
