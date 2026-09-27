"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { applyLineReviewEvent, beginReviewCycle, resolveCorrection } from "../review-model";

type ConnectionState = {
  status: "loading" | "error" | "not_connected" | "pairing" | "connected" | "disabled";
  maskedRecipient: string | null;
  pairedAt: string | null;
};

type PairingCode = { pairingCode: string; expiresAt: string };

export function CorrectionsWorkspace() {
  const dashboard = useDashboardData();
  const [selectedContentId, setSelectedContentId] = useState("");
  const [connection, setConnection] = useState<ConnectionState>({ status: "loading", maskedRecipient: null, pairedAt: null });
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [isConfiguringWebhook, setIsConfiguringWebhook] = useState(false);
  const [isSendingReview, setIsSendingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const readyContent = useMemo(() => dashboard.state?.contents.filter((content) => !content.deletedAt && content.productionStatus === "ready") ?? [], [dashboard.state]);

  useEffect(() => {
    let active = true;
    void fetch("/api/line/pairing", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("line_connection_unavailable");
        const result = await response.json() as { status?: unknown; maskedRecipient?: unknown; pairedAt?: unknown };
        if (active) setConnection({
          status: result.status === "connected" || result.status === "pairing" || result.status === "disabled" ? result.status : "not_connected",
          maskedRecipient: typeof result.maskedRecipient === "string" ? result.maskedRecipient : null,
          pairedAt: typeof result.pairedAt === "string" ? result.pairedAt : null,
        });
      })
      .catch(() => { if (active) setConnection({ status: "error", maskedRecipient: null, pairedAt: null }); });
    return () => { active = false; };
  }, []);

  if (!dashboard.state) return <section><h1>งานที่ต้องแก้</h1><p>กำลังโหลดข้อมูล…</p></section>;

  const openCorrections = dashboard.state.corrections.filter((correction) => correction.status === "open");
  const selectedContent = dashboard.state.contents.find((content) => content.id === selectedContentId) ?? readyContent[0] ?? null;
  const lineConnected = connection.status === "connected";
  const reviewAlreadySent = selectedContent?.lineReview.status === "sent" || selectedContent?.lineReview.status === "approved";

  async function refreshConnection() {
    setConnection((current) => ({ ...current, status: "loading" }));
    try {
      const response = await fetch("/api/line/pairing", { cache: "no-store" });
      if (!response.ok) throw new Error("line_connection_unavailable");
      const result = await response.json() as { status?: unknown; maskedRecipient?: unknown; pairedAt?: unknown };
      setConnection({
        status: result.status === "connected" || result.status === "pairing" || result.status === "disabled" ? result.status : "not_connected",
        maskedRecipient: typeof result.maskedRecipient === "string" ? result.maskedRecipient : null,
        pairedAt: typeof result.pairedAt === "string" ? result.pairedAt : null,
      });
    } catch {
      setConnection({ status: "error", maskedRecipient: null, pairedAt: null });
    }
  }

  async function createPairingCode() {
    setIsPairing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/line/pairing", { method: "POST" });
      const result = await response.json() as { pairingCode?: unknown; expiresAt?: unknown; connection?: { status?: unknown; maskedRecipient?: unknown; pairedAt?: unknown }; error?: string };
      if (!response.ok || typeof result.pairingCode !== "string" || typeof result.expiresAt !== "string") {
        throw new Error(result.error ?? "line_pairing_unavailable");
      }
      setPairingCode({ pairingCode: result.pairingCode, expiresAt: result.expiresAt });
      setConnection({ status: "pairing", maskedRecipient: null, pairedAt: null });
      setNotice("สร้างรหัสแล้ว เพิ่ม LINE OA เป็นเพื่อน แล้วส่งคำสั่งที่แสดงด้านล่างจากบัญชีผู้รับ");
    } catch {
      setError("สร้างรหัสจับคู่ไม่สำเร็จ ลองตรวจสอบการเชื่อมต่อแล้วทำซ้ำ");
    } finally {
      setIsPairing(false);
    }
  }

  async function configureWebhook() {
    setIsConfiguringWebhook(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/line/webhook-settings", { method: "POST" });
      const result = await response.json() as { configured?: unknown; verified?: unknown; active?: unknown };
      if (!response.ok || result.configured !== true || result.verified !== true || result.active !== true) {
        throw new Error("line_webhook_unavailable");
      }
      setNotice("LINE webhook ตั้งค่าและตรวจสอบแล้ว พร้อมรับคำสั่งจับคู่จากแชตผู้รับ");
    } catch {
      setError("ตั้งค่า LINE webhook ไม่สำเร็จ ตรวจสอบ URL และค่าช่องทาง LINE ใน Vercel");
    } finally {
      setIsConfiguringWebhook(false);
    }
  }

  async function startReview() {
    if (!selectedContent) return;
    const cycleId = `cycle-${selectedContent.id}-${Date.now()}`;
    await dashboard.mutate((state) => ({ ...state, contents: state.contents.map((content) => content.id === selectedContent.id ? beginReviewCycle(content, cycleId, new Date().toISOString()) : content) }));
    setSelectedContentId(selectedContent.id);
    setNotice("เริ่มรอบตรวจแล้ว พร้อมส่งผ่าน LINE ที่จับคู่ไว้");
  }

  async function sendReview() {
    const content = dashboard.state?.contents.find((item) => item.id === selectedContentId) ?? selectedContent;
    if (!lineConnected) { setError("ต้องจับคู่ LINE OA ก่อนส่งตรวจ"); return; }
    if (!content?.lineReview.activeCycleId || !content.lineReview.reviewCode) { setError("เริ่มรอบตรวจก่อนส่ง"); return; }

    setIsSendingReview(true);
    setError(null);
    try {
      const response = await fetch("/api/line/send-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: content.id, cycleId: content.lineReview.activeCycleId, reviewCode: content.lineReview.reviewCode }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "line_delivery_failed");
      await dashboard.mutate((state) => ({ ...state, contents: state.contents.map((item) => item.id === content.id ? applyLineReviewEvent(item, "sent", new Date().toISOString()) : item) }));
      setNotice("ส่งรอบตรวจไปยัง LINE ที่จับคู่ไว้แล้ว");
    } catch {
      setError("ส่งตรวจไม่สำเร็จ ลองใหม่ได้โดยใช้รอบตรวจเดิม");
    } finally {
      setIsSendingReview(false);
    }
  }

  return <section className="corrections-workspace" aria-labelledby="corrections-heading">
    <div className="workspace-heading-row"><div><p className="eyebrow">INDY / LINE REVIEW</p><h1 id="corrections-heading">งานที่ต้องแก้</h1><p>รับคำสั่งอนุมัติหรือแก้ไขจาก LINE ด้วยรหัสรอบตรวจ</p></div></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="settings-panel" aria-labelledby="line-review-heading">
      <h2 id="line-review-heading">เชื่อมต่อและส่งงานตรวจผ่าน LINE</h2>
      {connection.status === "loading" && <p role="status">กำลังตรวจสอบสถานะ LINE…</p>}
      {connection.status === "error" && <p role="alert">ตรวจสอบสถานะ LINE ไม่สำเร็จ ลองรีเฟรชสถานะ</p>}
      {connection.status === "not_connected" && <p role="status">ยังไม่ได้จับคู่ LINE</p>}
      {connection.status === "pairing" && <p role="status">รอการจับคู่ LINE กับบัญชีผู้รับ</p>}
      {lineConnected && <p role="status">เชื่อมต่อ LINE แล้ว: {connection.maskedRecipient ?? "ผู้รับที่จับคู่ไว้"}</p>}
      {connection.status === "disabled" && <p role="status">การเชื่อมต่อ LINE ถูกปิดไว้</p>}
      <button type="button" onClick={() => void configureWebhook()} disabled={isConfiguringWebhook}>{isConfiguringWebhook ? "กำลังตั้งค่า webhook…" : "ตั้งค่า webhook LINE"}</button>
      {!lineConnected && <button type="button" onClick={() => void createPairingCode()} disabled={isPairing || connection.status === "loading"}>{isPairing ? "กำลังสร้างรหัส…" : "สร้างรหัสจับคู่"}</button>}
      {connection.status === "pairing" && <button type="button" onClick={() => void refreshConnection()}>รีเฟรชสถานะ LINE</button>}
      {pairingCode && <div className="line-pairing-instructions" aria-label="คำแนะนำการจับคู่ LINE">
        <p>ส่งข้อความนี้ให้ LINE OA จากบัญชีผู้รับ:</p>
        <p><code>เชื่อมต่อ {pairingCode.pairingCode}</code></p>
        <p>รหัสหมดอายุ {new Date(pairingCode.expiresAt).toLocaleString("th-TH")}</p>
      </div>}
      <label>คอนเทนต์<select aria-label="คอนเทนต์สำหรับส่งตรวจ" value={selectedContent?.id ?? ""} onChange={(event) => setSelectedContentId(event.target.value)}><option value="">เลือกคอนเทนต์</option>{readyContent.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>
      {selectedContent?.lineReview.reviewCode && <p>รหัสรอบตรวจ: <code>{selectedContent.lineReview.reviewCode}</code> · สถานะ {selectedContent.lineReview.status}</p>}
      <div className="settings-dialog-actions">
        <button type="button" onClick={() => void startReview()} disabled={!selectedContent}>เริ่มรอบตรวจ</button>
        <button type="button" onClick={() => void sendReview()} disabled={!lineConnected || !selectedContent?.lineReview.reviewCode || reviewAlreadySent || isSendingReview}>{isSendingReview ? "กำลังส่ง…" : "ส่งตรวจผ่าน LINE"}</button>
      </div>
    </section>
    <section aria-labelledby="open-corrections-heading"><div className="workspace-heading-row"><h2 id="open-corrections-heading">รายการที่รอแก้ ({openCorrections.length})</h2></div>{openCorrections.length === 0 ? <p className="empty-state">ยังไม่มีงานที่ต้องแก้</p> : <ul>{openCorrections.map((correction) => { const content = dashboard.state?.contents.find((item) => item.id === correction.contentId); return <li key={correction.id}><strong>{content?.title ?? correction.contentId}</strong><p>{correction.comment}</p><button type="button" onClick={() => void dashboard.mutate((state) => resolveCorrection(state, correction.id, new Date().toISOString()))}>รับทราบและเตรียมรอบใหม่</button></li>; })}</ul>}</section>
  </section>;
}
