"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { Platform } from "../../domain/types";
import { createPublicationAttempt, updatePublicationAttempt } from "../publication-commands";

const platformLabels: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };

export function MakeDeliveryWorkspace() {
  const dashboard = useDashboardData();
  const [contentId, setContentId] = useState("");
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [publishAt, setPublishAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const readyContent = useMemo(() => dashboard.state?.contents.filter((content) => !content.deletedAt && content.productionStatus === "ready") ?? [], [dashboard.state]);
  if (!dashboard.state) return <section><h1>ส่งโพสต์ผ่าน Make</h1><p>กำลังโหลดข้อมูล…</p></section>;

  async function plan() {
    if (!contentId || !publishAt) { setError("เลือกคอนเทนต์และเวลาส่งก่อน"); return; }
    try { await dashboard.mutate((state) => createPublicationAttempt(state, { contentId, platform, publishAt }, new Date().toISOString())); setError(null); setNotice("วางแผนคิวเผยแพร่แล้ว"); } catch (caught) { setError(caught instanceof Error ? caught.message : "วางแผนไม่สำเร็จ"); }
  }

  async function deliver(attemptId: string) {
    const attempt = dashboard.state?.publicationAttempts.find((item) => item.id === attemptId);
    if (!attempt) return;
    const response = await fetch("/api/make/publications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: attempt.id, contentId: attempt.contentId, platform: attempt.platform, publishAt: attempt.publishAt }) });
    const body = await response.json() as { error?: string; queueId?: string };
    if (!response.ok) { setError(body.error ?? "ส่ง Make ไม่สำเร็จ"); await dashboard.mutate((state) => updatePublicationAttempt(state, attempt.id, { status: "failed", errorCode: body.error ?? "MAKE_ERROR" }, new Date().toISOString())); return; }
    await dashboard.mutate((state) => updatePublicationAttempt(state, attempt.id, { status: "queued", queueId: body.queueId ?? attempt.id }, new Date().toISOString()));
    setError(null); setNotice("ส่งเข้าคิว Make แล้ว");
  }

  return <section className="make-delivery-workspace" aria-labelledby="make-delivery-heading"><div className="workspace-heading-row"><div><p className="eyebrow">INDY / MAKE</p><h1 id="make-delivery-heading">ส่งโพสต์ผ่าน Make</h1><p>วางแผนคิว, ส่งเข้ากระบวนการ Make และติดตามผลแบบ idempotent</p></div></div>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<section className="settings-panel" aria-labelledby="make-plan-heading"><h2 id="make-plan-heading">วางแผนเผยแพร่</h2><label>คอนเทนต์<select aria-label="คอนเทนต์สำหรับเผยแพร่" value={contentId} onChange={(event) => setContentId(event.target.value)}><option value="">เลือกคอนเทนต์</option>{readyContent.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label><label>ช่องทาง<select aria-label="ช่องทางเผยแพร่" value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>{(Object.keys(platformLabels) as Platform[]).map((key) => <option key={key} value={key}>{platformLabels[key]}</option>)}</select></label><label>เวลาส่ง<input aria-label="เวลาส่งโพสต์" type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} /></label><button type="button" onClick={() => void plan()}>วางแผนเผยแพร่</button></section><section aria-labelledby="publication-queue-heading"><h2 id="publication-queue-heading">คิวเผยแพร่</h2>{dashboard.state.publicationAttempts.length === 0 ? <p className="empty-state">ยังไม่มีคิวเผยแพร่</p> : <ul>{dashboard.state.publicationAttempts.map((attempt) => { const content = dashboard.state?.contents.find((item) => item.id === attempt.contentId); return <li key={attempt.id}><strong>{content?.title ?? attempt.contentId}</strong><span>{platformLabels[attempt.platform]} · {attempt.publishAt} · {attempt.status}</span>{attempt.status === "local-plan" || attempt.status === "failed" ? <button type="button" onClick={() => void deliver(attempt.id)}>ส่งเข้าคิว Make</button> : null}</li>; })}</ul>}</section></section>;
}
