type PublicationRequest = { attemptId?: string; contentId?: string; platform?: string; publishAt?: string; payload?: Record<string, unknown> };

export async function POST(request: Request): Promise<Response> {
  let body: PublicationRequest;
  try { body = await request.json() as PublicationRequest; } catch { return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 }); }
  if (!body.attemptId || !body.contentId || !body.platform || !body.publishAt) return Response.json({ error: "ข้อมูลคิวเผยแพร่ไม่ครบ" }, { status: 400 });
  const webhookUrl = process.env.MAKE_PUBLICATION_WEBHOOK_URL;
  if (!webhookUrl) return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Make" }, { status: 503 });
  try {
    const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.MAKE_API_TOKEN ? { Authorization: `Bearer ${process.env.MAKE_API_TOKEN}` } : {}) }, body: JSON.stringify({ ...body, sentAt: new Date().toISOString() }) });
    if (!response.ok) return Response.json({ error: "Make ปฏิเสธคิวเผยแพร่" }, { status: 502 });
    return Response.json({ status: "queued", queueId: body.attemptId });
  } catch (caught) { return Response.json({ error: caught instanceof Error ? caught.message : "ส่ง Make ไม่สำเร็จ" }, { status: 502 }); }
}
