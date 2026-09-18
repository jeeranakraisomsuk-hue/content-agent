import type { DashboardState } from "../domain/types";
import type { DashboardBackupV1, DashboardImportMode } from "./backup-schema";
import { previewDashboardImport, validateDashboardBackup } from "./export-dashboard";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

type BackupCollection = "contents" | "media" | "categories" | "formats" | "references" | "captionTemplates" | "corrections" | "monthlyGoals" | "publicationAttempts" | "integrations";

export interface ApplyDashboardImportOptions {
  mode: DashboardImportMode;
  preRestoreBackup?: DashboardBackupV1;
}

export function applyDashboardImport(current: DashboardState, input: DashboardBackupV1, options: ApplyDashboardImportOptions): DashboardState {
  const backup = validateDashboardBackup(input);
  if (options.mode === "replace" && !options.preRestoreBackup) throw new Error("ต้องสร้าง backup ก่อนแทนที่ข้อมูล");
  if (options.mode === "replace") return clone(backup.data) as DashboardState;

  const next = clone(current);
  const collections: BackupCollection[] = ["contents", "media", "categories", "formats", "references", "captionTemplates", "corrections", "monthlyGoals", "publicationAttempts", "integrations"];
  for (const collection of collections) {
    const existing = new Set((next[collection] as Array<{ id?: string; month?: string; provider?: string }>).map((item) => item.id ?? item.month ?? item.provider));
    const incoming = backup.data[collection] as Array<{ id?: string; month?: string; provider?: string }>;
    const additions = incoming.filter((item) => {
      const key = item.id ?? item.month ?? item.provider;
      return key !== undefined && !existing.has(key);
    });
    (next[collection] as unknown as Array<unknown>).push(...clone(additions));
  }
  return next;
}

export { parseDashboardBackup, validateDashboardBackup } from "./export-dashboard";
export { previewDashboardImport };
export type { DashboardBackupV1 } from "./backup-schema";
