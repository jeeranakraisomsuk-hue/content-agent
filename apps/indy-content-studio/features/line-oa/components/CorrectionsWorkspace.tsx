"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { applyLineReviewEvent, beginReviewCycle, resolveCorrection } from "../review-model";

export function CorrectionsWorkspace() {
  const dashboard = useDashboardData();
  const [selectedContentId, setSelectedContentId] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const readyContent = useMemo(() => dashboard.state?.contents.filter((content) => !content.deletedAt && content.productionStatus === "ready") ?? [], [dashboard.state]);
  if (!dashboard.state) return <section><h1>งานที่ต้องแก้</h1><p>กำลังโหลดข้อมูล…</p></section>;

  const openCorrections = dashboard.state.corrections.filter((correction) => correction.status === "open");
  const selectedContent = dashboard.state.contents.find((content) => content.id === selectedContentId) ?? readyContent[0] ?? null;

  async function startReview() {
    if (!selectedContent) return;
    const cycleId = `cycle-${selectedContent.id}-${Date.now()}`;
    await dashboard.mutate((state) => ({ ...state, contents: state.contents.map((content) => content.id === selectedContent.id ? beginReviewCycle(content, cycleId, new Date().toISOString()) : content) }));
    setSelectedContentId(selectedContent.id);
    setNotice("เริ่มรอบตรวจแล้ว คัดลอกรหัสไปใช้ใน LINE ได้เลย");
  }

  async function sendReview() {
    const content = dashboard.state?.contents.find((item) => item.id === selectedContentId) ?? selectedContent;
    if (!content?.lineReview.activeCycleId || !content.lineReview.reviewCode || !recipientUserId.trim()) { setError("เลือกรายการและกรอก LINE User ID ก่อนส่งตรวจ"); return; }
    try {
      const response = await fetch("/api/line/send-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentId: content.id, cycleId: content.lineReview.activeCycleId, reviewCode: content.lineReview.reviewCode, recipientUserId: recipientUserId.trim(), messages: [{ type: "text", text: `ตรวจคอนเทนต์: ${content.title}\n${content.caption}\nรหัส: ${content.lineReview.reviewCode}\nตอบกลับ “อนุมัติ ${content.lineReview.reviewCode}” หรือ “แก้ไข ${content.lineReview.reviewCode}: รายละเอียด”` }] }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "ส่ง LINE ไม่สำเร็จ");
      await dashboard.mutate((state) => ({ ...state, contents: state.contents.map((item) => item.id === content.id ? applyLineReviewEvent(item, "sent", new Date().toISOString()) : item) }));
      setError(null); setNotice("ส่งรอบตรวจไป LINE แล้ว");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ส่ง LINE ไม่สำเร็จ"); }
  }

  return <section className="corrections-workspace" aria-labelledby="corrections-heading">
    <div className="workspace-heading-row"><div><p className="eyebrow">INDY / LINE REVIEW</p><h1 id="corrections-heading">งานที่ต้องแก้</h1><p>รับคำสั่งอนุมัติหรือแก้ไขจาก LINE ด้วยรหัสรอบตรวจ</p></div></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="settings-panel" aria-labelledby="line-review-heading"><h2 id="line-review-heading">ส่งงานตรวจผ่าน LINE</h2><label>คอนเทนต์<select aria-label="คอนเทนต์สำหรับส่งตรวจ" value={selectedContent?.id ?? ""} onChange={(event) => setSelectedContentId(event.target.value)}><option value="">เลือกคอนเทนต์</option>{readyContent.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>{selectedContent?.lineReview.reviewCode && <p>รหัสรอบตรวจ: <code>{selectedContent.lineReview.reviewCode}</code> · สถานะ {selectedContent.lineReview.status}</p>}<label>LINE User ID<input aria-label="LINE User ID" value={recipientUserId} onChange={(event) => setRecipientUserId(event.target.value)} placeholder="Uxxxxxxxx" /></label><div className="settings-dialog-actions"><button type="button" onClick={() => void startReview()} disabled={!selectedContent}>เริ่มรอบตรวจ</button><button type="button" onClick={() => void sendReview()} disabled={!selectedContent?.lineReview.reviewCode}>ส่งตรวจผ่าน LINE</button></div></section>
    <section aria-labelledby="open-corrections-heading"><div className="workspace-heading-row"><h2 id="open-corrections-heading">รายการที่รอแก้ ({openCorrections.length})</h2></div>{openCorrections.length === 0 ? <p className="empty-state">ยังไม่มีงานที่ต้องแก้</p> : <ul>{openCorrections.map((correction) => { const content = dashboard.state?.contents.find((item) => item.id === correction.contentId); return <li key={correction.id}><strong>{content?.title ?? correction.contentId}</strong><p>{correction.comment}</p><button type="button" onClick={() => void dashboard.mutate((state) => resolveCorrection(state, correction.id, new Date().toISOString()))}>รับทราบและเตรียมรอบใหม่</button></li>; })}</ul>}</section>
  </section>;
}
