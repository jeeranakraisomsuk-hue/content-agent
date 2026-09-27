import { NeonDashboardRepository, StaleDashboardStateError } from "../../../../../features/data/server/neon-dashboard-repository";
import type { DashboardState, PublicationAttempt } from "../../../../../features/domain/types";
import { applyPublicationResult } from "../../../../../features/publication/server/make-publication-handler";

type ResultBody = { attemptId?: string; status?: PublicationAttempt["status"]; providerPublicationId?: string; receiptUrl?: string; errorCode?: string };

async function mutateDashboard(mutate: (state: DashboardState) => DashboardState): Promise<void> {
  const repository = new NeonDashboardRepository();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await repository.loadDashboardState();
    try { await repository.saveDashboardState(mutate(snapshot.state), snapshot.version); return; } catch (error) { if (!(error instanceof StaleDashboardStateError) || attempt === 2) throw error; }
  }
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.MAKE_API_TOKEN;
  if (!expectedToken) return Response.json({ error: "ยังไม่ได้ตั้งค่า Make callback" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${expectedToken}`) return Response.json({ error: "ไม่ได้รับอนุญาต" }, { status: 401 });
  let body: ResultBody;
  try { body = await request.json() as ResultBody; } catch { return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 }); }
  const validStatuses: PublicationAttempt["status"][] = ["publishing", "published", "failed", "cancelled"];
  if (!body.attemptId || !body.status || !validStatuses.includes(body.status)) return Response.json({ error: "ข้อมูลผลเผยแพร่ไม่ครบ" }, { status: 400 });
  if (body.status === "published" && !body.providerPublicationId && !body.receiptUrl) return Response.json({ error: "ผล published ต้องมีหลักฐาน" }, { status: 400 });
  try {
    await mutateDashboard((state) => applyPublicationResult(state, { id: body.attemptId!, status: body.status!, providerPublicationId: body.providerPublicationId ?? null, receiptUrl: body.receiptUrl ?? null, errorCode: body.errorCode ?? null }, new Date().toISOString()));
    return Response.json({ status: "accepted" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "บันทึกผลเผยแพร่ไม่สำเร็จ" }, { status: 409 }); }
}
