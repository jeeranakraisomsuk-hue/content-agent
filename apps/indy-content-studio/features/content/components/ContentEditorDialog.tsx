"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { ContentItem, ProductionStatus } from "../../domain/types";
import { contentToDraft, getAllowedPlatforms, type ContentDraft } from "../content-draft";
import { copyContentAsNew, saveContentDraft, upsertDraft } from "../content-commands";
import { softDeleteContent } from "../content-trash-commands";
import { PlatformScheduleFields } from "../../calendar/components/PlatformScheduleFields";
import { createRecurringCopies, getRecurringCopyDates, type CopyCadence } from "../content-recurrence";
import { createPublicationAttempt } from "../../publication/publication-commands";
import { getPublicationEligibility } from "../../publication/publication-eligibility";

const productionStatuses: Array<{ value: ProductionStatus; label: string }> = [
  { value: "waiting-shoot", label: "ยังไม่ได้ทำ" },
  { value: "shot", label: "ถ่ายทำแล้ว" },
  { value: "editing", label: "กำลังทำ / ตัดต่อ" },
  { value: "review", label: "รอตรวจทาน" },
  { value: "needs-changes", label: "ต้องแก้ไข" },
  { value: "ready", label: "พร้อมโพสต์" },
  { value: "published", label: "ส่งแล้ว / เผยแพร่แล้ว" },
];

const objectiveOptions = [
  ["branding", "สร้างแบรนด์"],
  ["awareness", "เพิ่มการรับรู้"],
  ["lead", "หาลูกค้าเป้าหมาย"],
  ["engagement", "เพิ่มการมีส่วนร่วม"],
  ["sales", "เพิ่มยอดขาย"],
] as const;

const priorityOptions = [["urgent", "เร่งด่วน"], ["high", "สำคัญ"], ["normal", "ตามแผน"], ["low", "รอได้"]] as const;

const lineReviewLabels: Record<ContentItem["lineReview"]["status"], string> = {
  "not-sent": "ยังไม่ส่งตรวจ",
  queued: "เข้าคิวตรวจ",
  sent: "ส่งตรวจแล้ว",
  "correction-requested": "ขอแก้ไข",
  approved: "Final / อนุมัติแล้ว",
  failed: "ส่งตรวจไม่สำเร็จ",
};

const publicationStatusLabels: Record<string, string> = {
  "local-plan": "วางแผนไว้",
  submitting: "กำลังส่ง Make",
  queued: "Make รับคิวแล้ว",
  publishing: "กำลังเผยแพร่",
  published: "เผยแพร่แล้ว",
  failed: "เผยแพร่ไม่สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

function emptyDraft(state: NonNullable<ReturnType<typeof useDashboardData>["state"]>): ContentDraft {
  return {
    title: "",
    categoryId: state.categories[0]?.id ?? "",
    formatId: state.formats[0]?.id ?? "",
    owner: "",
    objective: "awareness",
    priority: "normal",
    plannedWorkAt: "",
    readyDate: "",
    productionStatus: "waiting-shoot",
    assetIds: [],
    processSteps: [],
    caption: "",
    schedules: [],
    referenceIds: [],
    notes: "",
    localApproval: "pending",
  };
}

function nextContentId() {
  return `content-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ContentEditorDialog({ mode, contentId, open, onClose }: {
  mode: "create" | "edit";
  contentId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const dashboard = useDashboardData();
  const existing = dashboard.state?.contents.find((content) => content.id === contentId);
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [copyBuffer, setCopyBuffer] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [repeatCount, setRepeatCount] = useState(1);
  const [repeatCadence, setRepeatCadence] = useState<CopyCadence>("daily");
  const [repeatStartDate, setRepeatStartDate] = useState("");

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setCopyBuffer(null);
      setError(null);
      setNotice(null);
      setConfirmDelete(false);
      setRepeatCount(1);
      setRepeatCadence("daily");
      setRepeatStartDate("");
      return;
    }
    if (!dashboard.state) return;
    setDraft(existing ? contentToDraft(existing) : emptyDraft(dashboard.state));
    setCopyBuffer(null);
    setError(null);
    setNotice(null);
    setConfirmDelete(false);
  // Status changes from loading to ready once; ordinary saves keep it ready and preserve the working draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contentId, dashboard.status]);

  if (!open || !draft) return null;
  const ownerOptions = dashboard.state?.ownerOptions ?? [];
  const hasLegacyOwner = Boolean(draft.owner && !ownerOptions.includes(draft.owner));

  function patch(values: Partial<ContentDraft>) {
    setDraft((current) => current ? { ...current, ...values } : current);
    setNotice(null);
  }

  async function save() {
    if (!draft || isSaving) return;
    setIsSaving(true);
    try {
      const content = saveContentDraft(existing ?? null, draft, new Date().toISOString());
      await dashboard.mutate((state) => upsertDraft(state, content));
      setError(null);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  function copyCurrentTask() {
    if (!existing || !draft) return;
    try {
      setCopyBuffer(saveContentDraft(existing, draft, new Date().toISOString()));
      setNotice("คัดลอกงานแล้ว กดวางเป็นงานใหม่เพื่อสร้างสำเนา");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "คัดลอกงานไม่สำเร็จ");
    }
  }

  async function pasteTask() {
    if (!copyBuffer || isSaving) return;
    setIsSaving(true);
    try {
      const copy = copyContentAsNew(copyBuffer, nextContentId(), new Date().toISOString());
      await dashboard.mutate((state) => upsertDraft(state, copy));
      setNotice("วางสำเนาเป็นงานใหม่แล้ว");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "วางสำเนาไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTask() {
    if (!existing || !draft || isSaving) return;
    setIsSaving(true);
    try {
      await dashboard.mutate((state) => softDeleteContent(state, existing.id, new Date().toISOString()));
      setError(null);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ย้ายไปถังขยะไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  async function repeatTask() {
    if (!existing || !draft || isSaving) return;
    const now = new Date().toISOString();
    setIsSaving(true);
    try {
      const saved = saveContentDraft(existing, draft, now);
      await dashboard.mutate((state) => createRecurringCopies(upsertDraft(state, saved), saved.id, { count: repeatCount, cadence: repeatCadence, startDate: repeatStartDate || undefined }, now, (index) => `${saved.id}-copy-${Date.now()}-${index}`));
      setNotice(`สร้างสำเนา ${repeatCount} งานแล้ว`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "สร้างสำเนาซ้ำไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendToMake() {
    if (!existing || !draft || isSaving) return;
    const now = new Date().toISOString();
    try {
      const saved = saveContentDraft(existing, draft, now);
      const stateWithDraft = upsertDraft(dashboard.state!, saved);
      const plans = saved.schedules.filter((schedule) => schedule.enabled && schedule.publishAt).map((schedule, index) => ({ schedule, id: `${saved.id}-publication-${Date.now()}-${index}` }));
      if (!plans.length) throw new Error("ยังไม่ได้เปิดกำหนดการของช่องทางใด");
      const blockers = plans.flatMap(({ schedule }) => getPublicationEligibility(stateWithDraft, saved.id, schedule.platform, now).reasons);
      if (blockers.length) throw new Error([...new Set(blockers)].join(" · "));
      setIsSaving(true);
      await dashboard.mutate((state) => plans.reduce((next, plan) => createPublicationAttempt(next, { contentId: saved.id, platform: plan.schedule.platform, publishAt: plan.schedule.publishAt!, attemptId: plan.id }, now), upsertDraft(state, saved)));
      for (const plan of plans) {
        const response = await fetch("/api/make/publications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: plan.id }) });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string; reasons?: string[] };
          throw new Error(body.error ?? body.reasons?.join(" · ") ?? "ส่ง Make ไม่สำเร็จ");
        }
        await response.json().catch(() => ({}));
        await dashboard.reload();
      }
      setNotice(`ส่ง ${plans.length} ช่องทางเข้า Make แล้ว รอผลโพสต์ตามเวลาที่ตั้งไว้`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ส่ง Make ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  const repeatAnchor = repeatStartDate || draft.plannedWorkAt.slice(0, 10);
  let repeatPreview: string[] = [];
  if (repeatAnchor) {
    try { repeatPreview = getRecurringCopyDates(repeatAnchor, repeatCount, repeatCadence); } catch { repeatPreview = []; }
  }
  const lineReviewReady = existing?.lineReview.status === "approved";
  const hasActivePublication = Boolean(existing && dashboard.state?.publicationAttempts.some((attempt) => attempt.contentId === existing.id && ["submitting", "queued", "publishing"].includes(attempt.status)));
  const productionFinalReady = mode === "edit" && Boolean(existing) && draft.productionStatus === "ready" && draft.localApproval === "approved" && draft.processSteps.every((step) => step.status === "done");
  const finalCandidate = productionFinalReady && lineReviewReady;

  return (
    <div className="settings-dialog-backdrop">
      <section className="content-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="full-editor-heading">
        <div className="workspace-heading-row">
          <div><p className="eyebrow">CONTENT EDITOR</p><h2 id="full-editor-heading">{mode === "create" ? "สร้างคอนเทนต์" : "แก้ไขคอนเทนต์"}</h2></div>
          <button className="drawer-close-button" type="button" onClick={onClose} aria-label="ปิดตัวแก้ไข">×</button>
        </div>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}

        <fieldset>
          <legend>รายละเอียดคอนเทนต์</legend>
          <label className="editor-wide">ชื่อคอนเทนต์<input value={draft.title} disabled={hasActivePublication} onChange={(event) => patch({ title: event.target.value })} /></label>
          <label>ประเภทคอนเทนต์<select value={draft.categoryId} onChange={(event) => patch({ categoryId: event.target.value })}>{dashboard.state?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>รูปแบบการนำเสนอ<select value={draft.formatId} disabled={hasActivePublication} onChange={(event) => patch({ formatId: event.target.value })}>{dashboard.state?.formats.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}</select></label>
          <p className="editor-helper">ประเภทคอนเทนต์คือเนื้อหา เช่น ความรู้หรือรีวิว ส่วนรูปแบบคือวิธีนำเสนอ เช่น วิดีโอหรือภาพ ปรับรายการได้ที่ตั้งค่า</p>
          <label>ผู้รับผิดชอบ<select aria-label="ผู้รับผิดชอบ" value={draft.owner} onChange={(event) => patch({ owner: event.target.value })}><option value="">เลือกผู้รับผิดชอบ</option>{hasLegacyOwner && <option value={draft.owner}>{draft.owner} (งานเดิม)</option>}{ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label>
          <label>สถานะการผลิต<select value={draft.productionStatus} onChange={(event) => patch({ productionStatus: event.target.value as ProductionStatus })}>{productionStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label>เป้าหมาย<select value={draft.objective} onChange={(event) => patch({ objective: event.target.value as ContentDraft["objective"] })}>{objectiveOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>ความสำคัญ<select value={draft.priority} onChange={(event) => patch({ priority: event.target.value as ContentDraft["priority"] })}>{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </fieldset>

        <fieldset>
          <legend>วันที่และรายละเอียดการผลิต</legend>
          <label>วันที่ลงในปฏิทิน<input type="date" value={draft.plannedWorkAt} onChange={(event) => patch({ plannedWorkAt: event.target.value })} /></label>
          <label>วันที่พร้อมผลิต<input type="date" value={draft.readyDate} onChange={(event) => patch({ readyDate: event.target.value })} /></label>
          <label className="editor-wide">แคปชัน<textarea value={draft.caption} disabled={hasActivePublication} onChange={(event) => patch({ caption: event.target.value })} /></label>
          <p className="editor-helper">กำหนดวันและเวลาลงแยกตามช่องทาง</p>
          <PlatformScheduleFields schedules={draft.schedules} allowedPlatforms={getAllowedPlatforms(draft.formatId)} defaultDate={draft.plannedWorkAt.slice(0, 10)} disabled={hasActivePublication} onChange={(schedules) => patch({ schedules })} />
          <label className="editor-wide">โน้ต<textarea value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
          <p className="editor-helper">สื่อที่เลือก {draft.assetIds.length}/10</p>
          <div className="editor-step-list" aria-label="ขั้นตอนการผลิต">
            {draft.processSteps.map((step, index) => (
              <div className="editor-step-row" key={step.id}>
                <label>ขั้นตอน {index + 1}<input value={step.name} onChange={(event) => patch({ processSteps: draft.processSteps.map((current) => current.id === step.id ? { ...current, name: event.target.value } : current) })} /></label>
                <label>สถานะขั้นตอน<select value={step.status} onChange={(event) => patch({ processSteps: draft.processSteps.map((current) => current.id === step.id ? { ...current, status: event.target.value as typeof step.status } : current) })}><option value="todo">ยังไม่เริ่ม</option><option value="doing">กำลังทำ</option><option value="done">เสร็จแล้ว</option></select></label>
                <button type="button" aria-label={`ลบขั้นตอน ${step.name}`} onClick={() => patch({ processSteps: draft.processSteps.filter((current) => current.id !== step.id) })}>ลบขั้นตอน</button>
              </div>
            ))}
          </div>
          <button className="editor-wide" type="button" onClick={() => patch({ processSteps: [...draft.processSteps, { id: `step-${Date.now()}`, name: "ขั้นตอนใหม่", scheduledDate: null, status: "todo", order: draft.processSteps.length }] })}>เพิ่มขั้นตอนการผลิต</button>
        </fieldset>

        {mode === "edit" && existing && <fieldset aria-label="ประวัติการทำงาน">
          <legend>ร่องรอยการทำงานทั้งหมด</legend>
          <p><strong>สถานะการผลิต:</strong> {productionStatuses.find((status) => status.value === existing.productionStatus)?.label ?? existing.productionStatus}</p>
          <p><strong>LINE review:</strong> {lineReviewLabels[existing.lineReview.status]}</p>
          {existing.lineReview.reviewCode && <p><strong>รหัสรอบตรวจ:</strong> {existing.lineReview.reviewCode}</p>}
          <div className="editor-history-list" aria-label="ประวัติ LINE">
            <strong>ประวัติ LINE</strong>
            {existing.lineReview.history.length ? existing.lineReview.history.map((event) => <div key={event.id}>{event.occurredAt} · {event.event}{event.comment ? ` · ${event.comment}` : ""}</div>) : <div>ยังไม่มีประวัติ</div>}
          </div>
          <div className="editor-history-list" aria-label="ประวัติการแก้ไข">
            <strong>งานแก้ไข</strong>
            {dashboard.state?.corrections.filter((correction) => correction.contentId === existing.id).length ? dashboard.state.corrections.filter((correction) => correction.contentId === existing.id).map((correction) => <div key={correction.id}>{correction.receivedAt} · {correction.status === "open" ? "ยังไม่แก้" : "แก้แล้ว"} · {correction.comment}</div>) : <div>ไม่มีรายการแก้ไข</div>}
          </div>
          <div className="editor-history-list" aria-label="สื่อ Final">
            <strong>สื่อ Final</strong>
            {dashboard.state?.media.filter((asset) => existing.assetIds.includes(asset.id)).length ? dashboard.state.media.filter((asset) => existing.assetIds.includes(asset.id)).map((asset) => <div key={asset.id}>{asset.name} · {asset.remoteStatus === "ready" ? "พร้อมใช้บนเซิร์ฟเวอร์" : asset.remoteStatus}</div>) : <div>ยังไม่มีสื่อ</div>}
          </div>
          <div className="editor-history-list" aria-label="คิว Make และผลเผยแพร่">
            <strong>Make / ผลเผยแพร่</strong>
            {dashboard.state?.publicationAttempts.filter((attempt) => attempt.contentId === existing.id).length ? dashboard.state.publicationAttempts.filter((attempt) => attempt.contentId === existing.id).map((attempt) => <div key={attempt.id}>{attempt.platform} · {attempt.publishAt} · {publicationStatusLabels[attempt.status] ?? attempt.status}{attempt.queueId ? ` · queue ${attempt.queueId}` : ""}{attempt.receiptUrl ? ` · ${attempt.receiptUrl}` : ""}</div>) : <div>ยังไม่มีคิว Make</div>}
          </div>
        </fieldset>}

        {productionFinalReady && !lineReviewReady && <p className="editor-helper">งานผลิตพร้อมแล้ว แต่ต้องส่งตรวจผ่าน LINE และได้รับสถานะ Final ก่อน จึงจะส่งเข้า Make ได้</p>}
        {finalCandidate && hasActivePublication && <p className="editor-helper">งานนี้อยู่ในคิว Make แล้ว จึงล็อกชื่อ แคปชัน รูปแบบ และกำหนดการจนกว่าจะได้รับผลยกเลิกหรือเผยแพร่</p>}

        {mode === "edit" && <fieldset>
          <legend>สำเนางานตามรอบเวลา</legend>
          <p className="editor-helper">สำเนาแต่ละชิ้นจะเริ่มกระบวนการใหม่ และยังไม่ถูกส่งเข้า Make</p>
          <label>จำนวนสำเนา<input aria-label="จำนวนสำเนา" type="number" min="1" max="365" value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} /></label>
          <label>รูปแบบการทำซ้ำ<select aria-label="รูปแบบการทำซ้ำ" value={repeatCadence} onChange={(event) => setRepeatCadence(event.target.value as CopyCadence)}><option value="daily">ทุกวัน</option><option value="every-other-day">วันเว้นวัน</option><option value="weekdays">จันทร์–ศุกร์</option></select></label>
          <label>เริ่มหลังวันที่ (ถ้าไม่กรอกจะใช้วันที่งาน)<input aria-label="วันที่เริ่มสำเนา" type="date" value={repeatStartDate} onChange={(event) => setRepeatStartDate(event.target.value)} /></label>
          <p className="editor-helper">วันที่สำเนา: {repeatPreview.length ? repeatPreview.join(", ") : "กรอกวันที่เริ่มต้นก่อน"}</p>
          <button type="button" onClick={() => void repeatTask()} disabled={isSaving || !repeatPreview.length}>สร้างสำเนาตามรอบเวลา</button>
        </fieldset>}

        <div className="settings-dialog-actions">
          {mode === "edit" && <div className="editor-actions-copy">
            <button type="button" onClick={copyCurrentTask} disabled={isSaving}>คัดลอกงาน</button>
            <button type="button" onClick={() => void pasteTask()} disabled={!copyBuffer || isSaving}>วางเป็นงานใหม่</button>
            {!confirmDelete
              ? <button data-danger="true" type="button" onClick={() => setConfirmDelete(true)} disabled={isSaving}>ลบงาน</button>
              : <><span role="alert">ย้ายงานนี้ไปถังขยะและกู้คืนได้ภายหลัง</span><button data-danger="true" type="button" onClick={() => void deleteTask()} disabled={isSaving}>ยืนยันลบงาน</button><button type="button" onClick={() => setConfirmDelete(false)} disabled={isSaving}>ไม่ลบ</button></>}
          </div>}
          <div className="editor-actions-main">{finalCandidate && <button type="button" onClick={() => void sendToMake()} disabled={isSaving || hasActivePublication}>Final · ส่งไป Make</button>}<button type="button" onClick={onClose} disabled={isSaving}>ยกเลิก</button><button type="button" onClick={() => void save()} disabled={isSaving}>{isSaving ? "กำลังบันทึก…" : "บันทึกคอนเทนต์"}</button></div>
        </div>
      </section>
    </div>
  );
}
