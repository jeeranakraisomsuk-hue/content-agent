import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import {
  NeonDashboardRepository,
  StaleDashboardStateError,
} from "../features/data/server/neon-dashboard-repository";
import { createNeonExecutor } from "../features/data/server/neon-client";

describe("NeonDashboardRepository", () => {
  it("requires a database URL outside injected tests", () => {
    expect(() => createNeonExecutor("")).toThrow("DATABASE_URL is required");
  });

  it("initializes once, persists a versioned snapshot, and rejects stale writes", async () => {
    const database = new Map<string, { version: number; state: unknown }>();
    const repository = new NeonDashboardRepository({
      execute: async (query, params) => {
        if (query.startsWith("SELECT")) {
          const row = database.get(String(params[0]));
          return row ? [{ ...row }] : [];
        }
        if (query.startsWith("INSERT")) {
          database.set(String(params[0]), { version: 1, state: params[1] });
          return [{ version: 1 }];
        }
        if (query.startsWith("UPDATE")) {
          const row = database.get(String(params[0]));
          if (!row || row.version !== Number(params[2])) return [];
          row.version += 1;
          row.state = params[1];
          return [{ version: row.version }];
        }
        throw new Error(`Unexpected query: ${query}`);
      },
    });

    const initial = await repository.loadDashboardState();
    expect(initial.version).toBe(1);

    const next = createEmptyDashboardState();
    next.notificationReadIds.push("notice-1");
    await expect(repository.saveDashboardState(next, initial.version)).resolves.toEqual({ version: 2 });
    await expect(repository.loadDashboardState()).resolves.toMatchObject({ version: 2, state: { notificationReadIds: ["notice-1"] } });
    await expect(repository.saveDashboardState(next, initial.version)).rejects.toBeInstanceOf(StaleDashboardStateError);
  });

  it("rejects an invalid database snapshot", async () => {
    const repository = new NeonDashboardRepository({ execute: async () => [{ version: 1, state: { schemaVersion: 1 } }] });

    await expect(repository.loadDashboardState()).rejects.toThrow("ไม่รองรับข้อมูล dashboard");
  });
});
