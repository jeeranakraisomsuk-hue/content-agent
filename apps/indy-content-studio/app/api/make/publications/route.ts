import { NeonDashboardRepository, StaleDashboardStateError } from "../../../../features/data/server/neon-dashboard-repository";
import { getPublicationEligibility } from "../../../../features/publication/publication-eligibility";
import { buildMakePublicationPayload } from "../../../../features/publication/server/make-publication-handler";
import { updatePublicationAttempt } from "../../../../features/publication/publication-commands";
import type { DashboardState } from "../../../../features/domain/types";

type PublicationRequest = { attemptId?: string };

async function mutateDashboard(mutate: (state: DashboardState) => DashboardState): Promise<void> {
  const repository = new NeonDashboardRepository();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await repository.loadDashboardState();
    try { await repository.saveDashboardState(mutate(snapshot.state), snapshot.version); return; } catch (error) { if (!(error instanceof StaleDashboardStateError) || attempt === 2) throw error; }
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: PublicationRequest;
  try { body = await request.json() as PublicationRequest; } catch { return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 }); }
  if (!body.attemptId) return Response.json({ error: "ข้อมูลคิวเผยแพร่ไม่ครบ" }, { status: 400 });
  const webhookUrl = process.env.MAKE_PUBLICATION_WEBHOOK_URL;
  if (!webhookUrl || !process.env.MAKE_API_TOKEN) return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Make ครบถ้วน" }, { status: 503 });

  const repository = new NeonDashboardRepository();
  try {
    const snapshot = await repository.loadDashboardState();
    const attempt = snapshot.state.publicationAttempts.find((item) => item.id === body.attemptId);
    if (!attempt) return Response.json({ error: "ไม่พบรายการเผยแพร่" }, { status: 404 });
    if (attempt.status === "queued" || attempt.status === "publishing") return Response.json({ status: "queued", queueId: attempt.queueId ?? attempt.id });
    if (attempt.status === "published") return Response.json({ status: "published", queueId: attempt.queueId ?? attempt.id });
    const content = snapshot.state.contents.find((item) => item.id === attempt.contentId && !item.deletedAt);
    const schedule = content?.schedules.find((item) => item.platform === attempt.platform && item.enabled);
    if (!content || !schedule) return Response.json({ error: "ไม่พบกำหนดการเผยแพร่" }, { status: 404 });
    const eligibility = getPublicationEligibility(snapshot.state, attempt.contentId, attempt.platform, new Date().toISOString());
    if (!eligibility.eligible) return Response.json({ error: "คอนเทนต์ยังไม่พร้อมส่ง Make", reasons: eligibility.reasons }, { status: 409 });
    const callbackUrl = new URL("/api/make/publications/result", process.env.APP_PUBLIC_BASE_URL ?? request.url).toString();
    const payload = buildMakePublicationPayload({ state: snapshot.state, content, platform: attempt.platform, schedule, attemptId: attempt.id, callbackUrl });
    await mutateDashboard((state) => updatePublicationAttempt(state, attempt.id, { status: "submitting" }, new Date().toISOString()));

    let response: Response;
    try {
      response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MAKE_API_TOKEN}` }, body: JSON.stringify(payload) });
    } catch {
      // The webhook may have accepted the request before the connection failed.
      // Keep `submitting` so a retry reuses the same idempotency key instead of
      // treating an uncertain network outcome as a confirmed failure.
      return Response.json({ error: "ไม่ทราบผลการรับคิวจาก Make กรุณาลองใหม่ด้วยคีย์เดิม" }, { status: 502 });
    }
    if (!response.ok) {
      await mutateDashboard((state) => updatePublicationAttempt(state, attempt.id, { status: "failed", errorCode: `MAKE_${response.status}` }, new Date().toISOString()));
      return Response.json({ error: "Make ปฏิเสธคิวเผยแพร่" }, { status: 502 });
    }
    let result: { queueId?: string } = {};
    try { result = await response.json() as { queueId?: string }; } catch { /* Make may return an empty 2xx response. */ }
    await mutateDashboard((state) => updatePublicationAttempt(state, attempt.id, { status: "queued", queueId: result.queueId ?? attempt.id }, new Date().toISOString()));
    return Response.json({ status: "queued", queueId: result.queueId ?? attempt.id });
  } catch { return Response.json({ error: "ระบบเผยแพร่ไม่พร้อมใช้งาน" }, { status: 503 }); }
}
