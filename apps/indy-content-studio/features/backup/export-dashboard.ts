import type { DashboardState } from "../domain/types";
import { DashboardBackupValidationError, type DashboardBackupV1, type DashboardImportMode, type DashboardImportPreview } from "./backup-schema";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function exportDashboardState(state: DashboardState, clock: (() => string | Date) | string | Date = () => new Date()): DashboardBackupV1 {
  const exportedAt = typeof clock === "function" ? clock() : clock;
  const data = clone({ ...state, integrations: state.integrations.map(({ provider, status, checkedAt }) => ({ provider, status, checkedAt })) });
  return {
    product: "INDY Content Studio",
    schemaVersion: 1,
    exportedAt: exportedAt instanceof Date ? exportedAt.toISOString() : exportedAt,
    data,
    omittedMediaFiles: state.media.map((media) => ({ mediaId: media.id, name: media.name, size: media.size })),
  };
}

function ids(values: Array<{ id: string }>, collection: string): Set<string> {
  const output = new Set<string>();
  for (const value of values) {
    if (!value.id || typeof value.id !== "string") throw new DashboardBackupValidationError(`${collection} มีรายการไม่มี ID`);
    if (output.has(value.id)) throw new DashboardBackupValidationError(`${collection} มี ID ซ้ำ: ${value.id}`);
    output.add(value.id);
  }
  return output;
}

export function validateDashboardBackup(input: unknown): DashboardBackupV1 {
  if (!input || typeof input !== "object") throw new DashboardBackupValidationError("ไฟล์สำรองไม่ใช่ object");
  const backup = input as Partial<DashboardBackupV1>;
  if (backup.product !== "INDY Content Studio" || backup.schemaVersion !== 1 || typeof backup.exportedAt !== "string" || !backup.data) throw new DashboardBackupValidationError("ไม่รองรับไฟล์สำรองนี้");
  const data = backup.data as DashboardBackupV1["data"];
  const collections = ["contents", "media", "categories", "formats", "references", "captionTemplates", "corrections", "monthlyGoals", "publicationAttempts", "integrations"] as const;
  for (const collection of collections) {
    if (!Array.isArray(data[collection])) throw new DashboardBackupValidationError(`ข้อมูล ${collection} ไม่ถูกต้อง`);
  }
  const mediaIds = ids(data.media, "media");
  const categoryIds = ids(data.categories, "categories");
  const formatIds = ids(data.formats, "formats");
  const referenceIds = ids(data.references, "references");
  const contentIds = ids(data.contents, "contents");
  ids(data.captionTemplates, "captionTemplates"); ids(data.corrections, "corrections"); ids(data.publicationAttempts, "publicationAttempts");
  for (const content of data.contents) {
    if (!categoryIds.has(content.categoryId) || !formatIds.has(content.formatId)) throw new DashboardBackupValidationError(`คอนเทนต์ ${content.id} อ้างอิงหมวดหมู่หรือรูปแบบที่ไม่มี`);
    if (content.assetIds.some((id) => !mediaIds.has(id))) throw new DashboardBackupValidationError(`คอนเทนต์ ${content.id} อ้างอิงสื่อที่ไม่มี`);
    if (content.referenceIds.some((id) => !referenceIds.has(id))) throw new DashboardBackupValidationError(`คอนเทนต์ ${content.id} อ้างอิง Reference ที่ไม่มี`);
  }
  for (const correction of data.corrections) if (!contentIds.has(correction.contentId)) throw new DashboardBackupValidationError(`งานแก้ ${correction.id} อ้างอิงคอนเทนต์ที่ไม่มี`);
  for (const attempt of data.publicationAttempts) if (!contentIds.has(attempt.contentId)) throw new DashboardBackupValidationError(`คิวเผยแพร่ ${attempt.id} อ้างอิงคอนเทนต์ที่ไม่มี`);
  return clone(backup) as DashboardBackupV1;
}

export function parseDashboardBackup(input: string | unknown): DashboardBackupV1 {
  let parsed: unknown = input;
  if (typeof input === "string") {
    try { parsed = JSON.parse(input); } catch { throw new DashboardBackupValidationError("ไฟล์สำรองไม่ใช่ JSON ที่ถูกต้อง"); }
  }
  return validateDashboardBackup(parsed);
}

function collectionEntries(backup: DashboardBackupV1, collection: keyof DashboardBackupV1["data"]): Array<{ id: string }> {
  const value = backup.data[collection];
  return Array.isArray(value) ? value as Array<{ id: string }> : [];
}

export function previewDashboardImport(current: DashboardState, backup: DashboardBackupV1, mode: DashboardImportMode = "merge"): DashboardImportPreview {
  const validated = validateDashboardBackup(backup);
  const collections = ["contents", "media", "references", "captionTemplates", "corrections", "publicationAttempts"] as const;
  const skipped: DashboardImportPreview["skipped"] = [];
  const counts = { contents: 0, media: 0, references: 0, captionTemplates: 0, corrections: 0, publicationAttempts: 0 };
  for (const collection of collections) {
    const currentIds = new Set(collectionEntries({ ...validated, data: current as DashboardBackupV1["data"] }, collection).map((item) => item.id));
    for (const item of collectionEntries(validated, collection)) {
      if (mode === "merge" && currentIds.has(item.id)) skipped.push({ collection, id: item.id, reason: "มีข้อมูลอยู่แล้ว" });
      else counts[collection] += 1;
    }
  }
  return { mode, counts, skipped, warnings: [], omittedMediaFiles: validated.omittedMediaFiles };
}
