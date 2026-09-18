"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { MediaAsset } from "../../domain/types";
import { createExternalMedia, createUploadedMedia, moveMediaToTrash, restoreMedia, updateMedia } from "../media-commands";
import { IndexedDbMediaBlobStore } from "../indexeddb-media-blob-store";
import type { MediaBlobStore } from "../media-blob-store";
import { createVideoPoster } from "../video-poster";
import { MediaPreviewDialog } from "./MediaPreviewDialog";

type ProviderUploadResult = {
  assetId: string;
  providerFileId: string;
  previewProviderFileId: string;
  remoteStatus: "ready";
};

const remoteStatusLabels: Record<MediaAsset["remoteStatus"], string> = {
  "local-only": "เก็บไว้ในเครื่องนี้เท่านั้น",
  uploading: "กำลังอัปโหลดไป Google Drive…",
  ready: "พร้อมใช้ผ่าน Google Drive",
  failed: "อัปโหลดไป Google Drive ไม่สำเร็จ",
};

function nextId() {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isProviderUploadResult(value: unknown, assetId: string): value is ProviderUploadResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ProviderUploadResult>;
  return result.assetId === assetId
    && result.remoteStatus === "ready"
    && typeof result.providerFileId === "string"
    && result.providerFileId.length > 0
    && typeof result.previewProviderFileId === "string"
    && result.previewProviderFileId.length > 0;
}

function fileFromBlob(blob: Blob, asset: MediaAsset): File {
  if (blob instanceof File && blob.name === asset.name) return blob;
  return new File([blob], asset.name, { type: asset.mimeType });
}

export function MediaLibraryWorkspace({ blobStore }: { blobStore?: MediaBlobStore } = {}) {
  const dashboard = useDashboardData();
  const activeBlobStore = useMemo(() => blobStore ?? new IndexedDbMediaBlobStore(), [blobStore]);
  const [tab, setTab] = useState<"all" | "trash">("all");
  const [query, setQuery] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalPreviewUrl, setExternalPreviewUrl] = useState("");
  const [externalKind, setExternalKind] = useState("video/mp4");
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!dashboard.state) {
    return <section aria-labelledby="media-heading"><h1 id="media-heading">คลังสื่อ</h1><p>กำลังโหลดข้อมูล…</p></section>;
  }

  const assets = dashboard.state.media
    .filter((asset) => (tab === "trash" ? Boolean(asset.deletedAt) : !asset.deletedAt))
    .filter((asset) => asset.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  async function setRemoteState(id: string, patch: Pick<MediaAsset, "remoteStatus" | "providerFileId" | "previewProviderFileId">) {
    await dashboard.mutate((state) => ({
      ...state,
      media: state.media.map((asset) => asset.id === id ? { ...asset, ...patch, updatedAt: new Date().toISOString() } : asset),
    }));
  }

  async function uploadToProvider(asset: MediaAsset, source: Blob) {
    await setRemoteState(asset.id, { remoteStatus: "uploading", providerFileId: null, previewProviderFileId: null });
    try {
      const file = fileFromBlob(source, asset);
      const form = new FormData();
      form.set("assetId", asset.id);
      form.set("file", file);
      if (asset.mimeType.startsWith("video/")) {
        try {
          const poster = await createVideoPoster(file);
          const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
          form.set("preview", new File([poster], `${baseName}-poster.jpg`, { type: "image/jpeg" }));
        } catch {
          throw new Error("ไม่สามารถสร้างภาพตัวอย่างจากวิดีโอนี้ได้");
        }
      }

      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const result: unknown = await response.json().catch(() => null);
      if (response.status === 503) {
        await setRemoteState(asset.id, { remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null });
        return;
      }
      if (!response.ok || !isProviderUploadResult(result, asset.id)) throw new Error("provider-upload-failed");

      await setRemoteState(asset.id, {
        remoteStatus: "ready",
        providerFileId: result.providerFileId,
        previewProviderFileId: result.previewProviderFileId,
      });
    } catch (caught) {
      await setRemoteState(asset.id, { remoteStatus: "failed", providerFileId: null, previewProviderFileId: null });
      if (caught instanceof Error && caught.message === "ไม่สามารถสร้างภาพตัวอย่างจากวิดีโอนี้ได้") setError(caught.message);
    }
  }

  async function upload(file: File) {
    const id = nextId();
    const now = new Date().toISOString();
    try {
      await activeBlobStore.put(id, file);
      await dashboard.mutate((state) => createUploadedMedia(state, { id, name: file.name, mimeType: file.type, size: file.size, now }));
      setError(null);
      await uploadToProvider({
        id,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        source: "upload",
        externalUrl: null,
        externalPreviewUrl: null,
        blobKey: id,
        remoteStatus: "local-only",
        providerFileId: null,
        previewProviderFileId: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }, file);
    } catch (caught) {
      await activeBlobStore.remove(id).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "อัปโหลดไม่สำเร็จ");
    }
  }

  async function retryProviderUpload(asset: MediaAsset) {
    const blob = await activeBlobStore.get(asset.blobKey ?? asset.id);
    if (!blob) {
      setError("ไม่พบไฟล์ต้นฉบับในเครื่องนี้");
      return;
    }
    setError(null);
    await uploadToProvider(asset, blob);
  }

  async function addExternal() {
    const id = nextId();
    const now = new Date().toISOString();
    try {
      await dashboard.mutate((state) => createExternalMedia(state, { id, name: externalName, mimeType: externalKind, externalUrl, externalPreviewUrl: externalPreviewUrl || undefined, now }));
      setExternalName("");
      setExternalUrl("");
      setExternalPreviewUrl("");
      setLinkOpen(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เพิ่มลิงก์ไม่สำเร็จ");
    }
  }

  async function trash(asset: MediaAsset) {
    await dashboard.mutate((state) => moveMediaToTrash(state, asset.id, new Date().toISOString()));
  }

  async function restore(asset: MediaAsset) {
    await dashboard.mutate((state) => restoreMedia(state, asset.id));
  }

  async function editTags(asset: MediaAsset) {
    const tags = window.prompt("แท็ก (คั่นด้วย comma)", asset.tags.join(", "));
    if (tags !== null) {
      try {
        await dashboard.mutate((state) => updateMedia(state, asset.id, { tags: tags.split(",") }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "แก้แท็กไม่สำเร็จ");
      }
    }
  }

  return <section className="media-library-workspace" aria-labelledby="media-heading">
    <div className="workspace-heading-row">
      <div><p className="eyebrow">INDY / MEDIA</p><h1 id="media-heading">คลังสื่อ</h1><p>เก็บไฟล์ต้นฉบับและลิงก์อ้างอิงไว้ที่เดียว</p></div>
      <div className="media-actions">
        <label className="media-upload-button">เลือกไฟล์สื่อ<input type="file" aria-label="เลือกไฟล์สื่อ" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
        <button type="button" onClick={() => setLinkOpen(true)}>เพิ่มลิงก์ภายนอก</button>
      </div>
    </div>
    {error && <p className="settings-notice error" role="alert">{error}</p>}
    <div className="media-toolbar">
      <div className="media-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>ทั้งหมด</button><button type="button" role="tab" aria-selected={tab === "trash"} onClick={() => setTab("trash")}>ถังขยะ</button></div>
      <label className="media-search">ค้นหาสื่อ<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {assets.length === 0
      ? <p className="overview-state">{tab === "trash" ? "ถังขยะว่าง" : "ยังไม่มีสื่อในคลัง"}</p>
      : <div className="media-grid">{assets.map((asset) => <article className="media-card" key={asset.id}>
        <div className="media-card-preview" aria-hidden="true">{asset.mimeType.startsWith("video/") ? "▶" : "▧"}</div>
        <strong>{asset.name}</strong>
        <span>{asset.source === "external" ? "ลิงก์ภายนอก" : `${Math.round(asset.size / 1024)} KB`}</span>
        {asset.source === "upload" && <span className={`media-remote-status ${asset.remoteStatus}`} aria-live="polite">{remoteStatusLabels[asset.remoteStatus]}</span>}
        <div className="media-card-actions">
          {tab === "all" && <>
            <button type="button" onClick={() => setPreview(asset)}>ดูตัวอย่าง</button>
            <button type="button" onClick={() => void editTags(asset)}>แก้แท็ก</button>
            {asset.remoteStatus === "failed" && <button type="button" onClick={() => void retryProviderUpload(asset)} aria-label={`ลองอัปโหลด ${asset.name} อีกครั้ง`}>ลองอีกครั้ง</button>}
            <button type="button" onClick={() => void trash(asset)} aria-label={`ย้าย ${asset.name} ไปถังขยะ`}>ถังขยะ</button>
          </>}
          {tab === "trash" && <button type="button" onClick={() => void restore(asset)} aria-label={`กู้คืน ${asset.name}`}>กู้คืน</button>}
        </div>
        {asset.tags.length > 0 && <small>{asset.tags.join(" · ")}</small>}
      </article>)}</div>}
    {linkOpen && <div className="settings-dialog-backdrop"><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="external-dialog-heading">
      <h2 id="external-dialog-heading">เพิ่มลิงก์ภายนอก</h2>
      <label>ชื่อสื่อภายนอก<input aria-label="ชื่อสื่อภายนอก" value={externalName} onChange={(event) => setExternalName(event.target.value)} /></label>
      <label>ลิงก์สื่อ<input aria-label="ลิงก์สื่อ" type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} /></label>
      <label>ลิงก์ภาพตัวอย่าง<input aria-label="ลิงก์ภาพตัวอย่าง" type="url" value={externalPreviewUrl} onChange={(event) => setExternalPreviewUrl(event.target.value)} /></label>
      <label>ชนิดสื่อ<select value={externalKind} onChange={(event) => setExternalKind(event.target.value)}><option value="video/mp4">วิดีโอ</option><option value="image/jpeg">ภาพ</option></select></label>
      <div className="settings-dialog-actions"><button type="button" onClick={() => setLinkOpen(false)}>ยกเลิก</button><button type="button" onClick={() => void addExternal()}>บันทึกลิงก์</button></div>
    </section></div>}
    <MediaPreviewDialog asset={preview} blobStore={activeBlobStore} onClose={() => setPreview(null)} />
  </section>;
}
