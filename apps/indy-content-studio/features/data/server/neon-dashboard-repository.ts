import { DashboardBackupValidationError } from "../../backup/backup-schema";
import { validateDashboardBackup } from "../../backup/export-dashboard";
import { createEmptyDashboardState } from "../../domain/create-empty-state";
import type { DashboardState } from "../../domain/types";
import { createNeonExecutor, type SqlExecutor } from "./neon-client";

const WORKSPACE_KEY = "primary";

export class StaleDashboardStateError extends Error {
  constructor() {
    super("Dashboard state changed before it could be saved");
    this.name = "StaleDashboardStateError";
  }
}

export interface DashboardSnapshot {
  state: DashboardState;
  version: number;
}

export class NeonDashboardRepository {
  private readonly execute: SqlExecutor;

  constructor({ execute = createNeonExecutor() }: { execute?: SqlExecutor } = {}) {
    this.execute = execute;
  }

  async loadDashboardState(): Promise<DashboardSnapshot> {
    const rows = await this.execute(
      "SELECT version, state FROM dashboard_snapshots WHERE workspace_key = $1",
      [WORKSPACE_KEY],
    );
    if (rows.length === 0) {
      const state = createEmptyDashboardState();
      await this.execute(
        "INSERT INTO dashboard_snapshots (workspace_key, state) VALUES ($1, $2) ON CONFLICT (workspace_key) DO NOTHING RETURNING version",
        [WORKSPACE_KEY, state],
      );
      return this.loadDashboardState();
    }

    return { version: numericVersion(rows[0].version), state: validateState(rows[0].state) };
  }

  async saveDashboardState(state: DashboardState, expectedVersion: number): Promise<{ version: number }> {
    const validated = validateState(state);
    const rows = await this.execute(
      "UPDATE dashboard_snapshots SET state = $2, version = version + 1, updated_at = now() WHERE workspace_key = $1 AND version = $3 RETURNING version",
      [WORKSPACE_KEY, validated, expectedVersion],
    );
    if (rows.length === 0) throw new StaleDashboardStateError();
    return { version: numericVersion(rows[0].version) };
  }
}

function numericVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid dashboard snapshot version");
  return version;
}

function validateState(value: unknown): DashboardState {
  try {
    return validateDashboardBackup({
      product: "INDY Content Studio",
      schemaVersion: 1,
      exportedAt: new Date(0).toISOString(),
      data: value,
      omittedMediaFiles: [],
    }).data as DashboardState;
  } catch (error) {
    if (error instanceof DashboardBackupValidationError) {
      throw new Error("ไม่รองรับข้อมูล dashboard", { cause: error });
    }
    throw error;
  }
}
