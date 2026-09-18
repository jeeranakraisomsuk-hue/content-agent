import type { DashboardState } from "../domain/types";

export type DashboardListener = (state: DashboardState) => void;

export interface DashboardRepository {
  read(): Promise<DashboardState>;
  write(next: DashboardState): Promise<void>;
  subscribe(listener: DashboardListener): () => void;
}

export function cloneDashboardState(state: DashboardState): DashboardState {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }

  return JSON.parse(JSON.stringify(state)) as DashboardState;
}
