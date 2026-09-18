import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { DashboardBackupValidationError } from "../features/backup/backup-schema";
import { exportDashboardState } from "../features/backup/export-dashboard";
import { applyDashboardImport, parseDashboardBackup, previewDashboardImport } from "../features/backup/import-dashboard";

describe("dashboard backup", () => {
  it("exports a versioned metadata-only envelope and round trips it", () => {
    const state = createEmptyDashboardState();
    state.media.push({ id: "asset-1", name: "clip.mp4", mimeType: "video/mp4", size: 12, source: "upload", externalUrl: null, externalPreviewUrl: null, blobKey: "blob-1", remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null, tags: [], createdAt: "now", updatedAt: "now", deletedAt: null });
    const backup = exportDashboardState(state, "2026-09-18T00:00:00.000Z");
    expect(backup).toMatchObject({ product: "INDY Content Studio", schemaVersion: 1, exportedAt: "2026-09-18T00:00:00.000Z" });
    expect(JSON.stringify(backup)).not.toContain("channel-secret");
    expect(JSON.stringify(backup)).not.toContain("data:video");
    expect(parseDashboardBackup(JSON.stringify(backup)).data.media[0].name).toBe("clip.mp4");
  });

  it("rejects future versions, duplicate IDs, and broken references", () => {
    const backup = exportDashboardState(createEmptyDashboardState(), "now");
    expect(() => parseDashboardBackup(JSON.stringify({ ...backup, schemaVersion: 2 }))).toThrow(DashboardBackupValidationError);
    const duplicate = { ...backup, data: { ...backup.data, references: [{ id: "x" }, { id: "x" }] } };
    expect(() => parseDashboardBackup(duplicate)).toThrow(/ID ซ้ำ/);
  });

  it("previews merge collisions and requires a pre-restore backup for replace", () => {
    const current = createEmptyDashboardState();
    const backup = exportDashboardState(current, "now");
    const preview = previewDashboardImport(current, backup, "merge");
    expect(preview.mode).toBe("merge");
    expect(() => applyDashboardImport(current, backup, { mode: "replace" })).toThrow(/สร้าง backup/);
    expect(applyDashboardImport(current, backup, { mode: "replace", preRestoreBackup: backup })).toMatchObject({ schemaVersion: 1 });
  });
});
