import type { DashboardState } from "../domain/types";
import {
  cloneDashboardState,
  type DashboardListener,
  type DashboardRepository,
} from "./dashboard-repository";

interface DashboardStateResponse {
  state: DashboardState;
  version: number;
}

export class ApiDashboardRepository implements DashboardRepository {
  private version: number | null = null;
  private readonly listeners = new Set<DashboardListener>();

  async read(): Promise<DashboardState> {
    const response = await fetch("/api/dashboard-state", { cache: "no-store" });
    if (!response.ok) throw new Error("โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ");
    const payload = await response.json() as DashboardStateResponse;
    this.version = payload.version;
    return cloneDashboardState(payload.state);
  }

  async write(next: DashboardState): Promise<void> {
    if (this.version === null) await this.read();
    const response = await fetch("/api/dashboard-state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: next, expectedVersion: this.version }),
    });
    if (response.status === 409) throw new Error("ข้อมูลถูกแก้ไขจากหน้าต่างอื่น กรุณาโหลดใหม่");
    if (!response.ok) throw new Error("บันทึกข้อมูลลงเซิร์ฟเวอร์ไม่สำเร็จ");
    const payload = await response.json() as { version: number };
    this.version = payload.version;
    const snapshot = cloneDashboardState(next);
    this.listeners.forEach((listener) => listener(snapshot));
  }

  subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
