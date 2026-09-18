import type { DashboardState, ReferenceIdea } from "../domain/types";

function https(url: string) { try { const parsed = new URL(url); if (parsed.protocol !== "https:") throw new Error(); return parsed.toString(); } catch { throw new Error("ลิงก์อ้างอิงต้องเป็น https"); } }
function cleanTags(tags: string[] = []) { const values = tags.map((tag) => tag.trim()).filter(Boolean); if (new Set(values.map((tag) => tag.toLowerCase())).size !== values.length) throw new Error("แท็กซ้ำกัน"); return values; }
export function addReference(state: DashboardState, input: { id: string; title: string; url: string; platform?: string; tags?: string[]; notes?: string; now: string }): DashboardState {
  const title = input.title.trim(); if (!title) throw new Error("กรุณาระบุชื่อไอเดีย"); const url = https(input.url); if (state.references.some((item) => !item.deletedAt && item.url === url)) throw new Error("มีลิงก์นี้อยู่แล้ว");
  const reference: ReferenceIdea = { id: input.id, title, url, platform: input.platform?.trim() || "ไม่ระบุ", tags: cleanTags(input.tags), notes: input.notes?.trim() || "", createdAt: input.now, updatedAt: input.now, deletedAt: null };
  return { ...state, references: [...state.references, reference] };
}
export function updateReference(state: DashboardState, id: string, patch: Partial<Pick<ReferenceIdea, "title" | "url" | "platform" | "tags" | "notes">>): DashboardState {
  return { ...state, references: state.references.map((item) => item.id === id ? { ...item, ...patch, title: patch.title === undefined ? item.title : patch.title.trim(), url: patch.url === undefined ? item.url : https(patch.url), tags: patch.tags === undefined ? item.tags : cleanTags(patch.tags), updatedAt: new Date().toISOString() } : item) };
}
export function deleteReference(state: DashboardState, id: string, now: string): DashboardState { return { ...state, references: state.references.map((item) => item.id === id ? { ...item, deletedAt: now, updatedAt: now } : item) }; }
