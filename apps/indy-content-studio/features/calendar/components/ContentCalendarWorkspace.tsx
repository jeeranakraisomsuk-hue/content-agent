"use client";

import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { ContentItem, Platform } from "../../domain/types";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { buildCalendarMonth, type CalendarEvent, type CalendarPlatformFilter } from "../calendar-selectors";
import { moveContentSchedules, movePlatformSchedule } from "../calendar-commands";
import { ContentEditorDialog } from "../../content/components/ContentEditorDialog";
import { softDeleteContent } from "../../content/content-trash-commands";

type CalendarItemStatus = "not-started" | "in-progress" | "sent";
type DraggedCalendarItem = { contentId: string; platform: Platform | null };

const CALENDAR_STATUS_LABELS: Record<CalendarItemStatus, string> = {
  "not-started": "ยังไม่ได้ทำ",
  "in-progress": "กำลังทำ",
  sent: "ส่งแล้ว",
};
const platformLabels: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };

function getCalendarItemStatus(item: ContentItem): CalendarItemStatus {
  if (item.productionStatus === "published" || item.schedules.some((schedule) => Boolean(schedule.manualEvidence))) return "sent";
  return item.productionStatus === "waiting-shoot" ? "not-started" : "in-progress";
}

function eventStatus(event: CalendarEvent): CalendarItemStatus {
  if (event.status === "published") return "sent";
  return event.status === "not-started" ? "not-started" : "in-progress";
}

function getCalendarStatusLabel(content: ContentItem, event: CalendarEvent | undefined, status: CalendarItemStatus): string {
  if (event?.status === "published") return "โพสต์แล้ว";
  if (content.lineReview.status === "correction-requested" || content.productionStatus === "needs-changes") return "ต้องแก้ไข";
  if (content.lineReview.status === "sent") return "ส่งตรวจ LINE แล้ว";
  if (content.lineReview.status === "approved" && content.productionStatus === "ready") return "Final พร้อมส่ง Make";
  if (content.productionStatus === "ready") return "พร้อม Final";
  return CALENDAR_STATUS_LABELS[status];
}

function shiftMonth(month: string, offset: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return new Date().toISOString().slice(0, 7);
  const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const monthNumber = ((absoluteMonth % 12) + 12) % 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

export function ContentCalendarWorkspace({ onCreateTask }: { onCreateTask: (date?: string) => void }) {
  const dashboard = useDashboardData();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [platform, setPlatform] = useState<CalendarPlatformFilter>("all");
  const [draggedItem, setDraggedItem] = useState<DraggedCalendarItem | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(() => new Set());
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const lastDragEndAt = useRef(0);
  const view = useMemo(() => dashboard.state ? buildCalendarMonth(dashboard.state, { month, platform }) : null, [dashboard.state, month, platform]);

  if (!view) return <section><h1>ปฏิทินคอนเทนต์</h1><p>กำลังโหลดข้อมูล…</p></section>;

  async function moveItemToDate(item: DraggedCalendarItem, date: string) {
    setMoveError(null);
    try {
      await dashboard.mutate((state) => item.platform
        ? movePlatformSchedule(state, item.contentId, item.platform, date, new Date().toISOString())
        : moveContentSchedules(state, item.contentId, date, [], new Date().toISOString()));
    } catch {
      setMoveError("ย้ายวันไม่สำเร็จ กรุณาตรวจว่าคิวที่ส่ง Make แล้วถูกยกเลิกก่อนหรือยัง");
    } finally {
      setDraggedItem(null);
      setDropTargetDate(null);
    }
  }

  function startDragging(event: DragEvent<HTMLElement>, item: DraggedCalendarItem) {
    event.dataTransfer.setData("text/plain", `${item.contentId}|${item.platform ?? ""}`);
    event.dataTransfer.effectAllowed = "move";
    setDraggedItem(item);
  }

  function dropOnDate(event: DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const [contentId, selectedPlatform] = (event.dataTransfer.getData("text/plain") || "|").split("|");
    const item = contentId ? { contentId, platform: (selectedPlatform || null) as Platform | null } : draggedItem;
    if (item) void moveItemToDate(item, date);
  }

  function openEditor(contentId: string) {
    setEditingContentId(contentId);
    setMoveError(null);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, contentId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openEditor(contentId);
  }

  function toggleContentSelection(contentId: string) {
    setSelectedContentIds((current) => {
      const next = new Set(current);
      if (next.has(contentId)) next.delete(contentId);
      else next.add(contentId);
      return next;
    });
  }

  async function deleteSelectedContent() {
    if (selectedContentIds.size === 0) return;
    const count = selectedContentIds.size;
    if (!window.confirm(`ลบคอนเทนต์ที่เลือก ${count} รายการหรือไม่`)) return;

    const ids = [...selectedContentIds];
    try {
      await dashboard.mutate((state) => ids.reduce((nextState, contentId) => softDeleteContent(nextState, contentId, new Date().toISOString()), state));
      setSelectedContentIds(new Set());
    } catch {
      setMoveError("ลบรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }

  function renderCard(content: ContentItem, event?: CalendarEvent) {
    const status = event ? eventStatus(event) : getCalendarItemStatus(content);
    const statusLabel = getCalendarStatusLabel(content, event, status);
    const channelText = event?.platform ? `${platformLabels[event.platform]} · ${event.time}` : "งานวางแผน";
    const scheduledTime = event?.time ?? "ไม่ระบุเวลา";
    const dragItem = { contentId: content.id, platform: event?.platform ?? null };
    const isSelected = selectedContentIds.has(content.id);
    return <article key={event?.id ?? content.id} className={`calendar-item calendar-item--${status}${isSelected ? " is-selected" : ""}`} draggable role="button"
      aria-label={`${content.title} · ${channelText} · ${statusLabel} · กดเพื่อแก้ไข หรือลากเพื่อย้ายวัน`}
      onDragStart={(dragEvent) => startDragging(dragEvent, dragItem)}
      onDragEnd={() => { lastDragEndAt.current = Date.now(); setDraggedItem(null); setDropTargetDate(null); }}
      onClick={() => { if (Date.now() - lastDragEndAt.current < 350) return; openEditor(content.id); }}
      onKeyDown={(keyboardEvent) => handleCardKeyDown(keyboardEvent, content.id)} tabIndex={0}>
      <span className="calendar-item-selection"><input type="checkbox" aria-label={`เลือก ${content.title}`} checked={isSelected}
        onChange={() => toggleContentSelection(content.id)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} /></span>
      <span className="calendar-item-title">{content.title}</span>
      <span className="calendar-item-time" aria-label={`เวลาลง ${scheduledTime}`}>{scheduledTime}</span>
      <span className="calendar-item-preview">
        <span className="calendar-item-meta">{channelText}</span>
        <span className="calendar-item-status">{statusLabel}</span>
      </span>
    </article>;
  }

  return <section className="calendar-workspace" aria-labelledby="calendar-heading">
    <div className="workspace-heading-row">
      <div><p className="eyebrow">INDY / CALENDAR</p><h1 id="calendar-heading">ปฏิทินคอนเทนต์</h1></div>
      <div className="calendar-header-actions">
        <div className="calendar-month-navigation" aria-label="เลื่อนเดือนปฏิทิน">
          <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => setMonth((current) => shiftMonth(current, -1))}>‹</button>
          <input type="month" aria-label="เดือนปฏิทิน" value={month} onChange={(event) => setMonth(event.target.value)} />
          <button type="button" aria-label="เดือนถัดไป" onClick={() => setMonth((current) => shiftMonth(current, 1))}>›</button>
        </div>
        <label className="calendar-platform-filter"><span>กรองช่องทาง</span><span className="calendar-platform-select"><select aria-label="กรองช่องทาง" value={platform} onChange={(event) => setPlatform(event.target.value as CalendarPlatformFilter)}><option value="all">รวมทุก Social</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select><svg aria-hidden="true" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3" /></svg></span></label>
        <button type="button" className="create-task-button" onClick={() => onCreateTask()}>สร้างชิ้นงานใหม่</button>
      </div>
    </div>
    {moveError && <p className="calendar-move-error" role="alert">{moveError}</p>}
    {selectedContentIds.size > 0 && <div className="calendar-selection-toolbar" role="region" aria-label="การเลือกหลายรายการ">
      <strong>เลือกแล้ว {selectedContentIds.size} รายการ</strong>
      <div>
        <button type="button" onClick={() => setSelectedContentIds(new Set())}>ยกเลิกการเลือก</button>
        <button type="button" className="calendar-delete-button" onClick={() => void deleteSelectedContent()}>ลบรายการที่เลือก</button>
      </div>
    </div>}
    <div className="calendar-grid" role="grid" aria-label="ปฏิทินคอนเทนต์">
      {view.cells.map((cell) => {
        const scheduledIds = new Set(cell.events.map((event) => event.content.id));
        const workItems = cell.items.filter((item) => !scheduledIds.has(item.id));
        return <div key={cell.date} className={`${cell.inMonth ? "calendar-cell" : "calendar-cell muted"}${dropTargetDate === cell.date ? " calendar-cell-drop-target" : ""}`} aria-label={cell.date} role="gridcell" tabIndex={-1}
          onDragOver={(event) => { if (!event.dataTransfer.types.includes("text/plain") && !draggedItem) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTargetDate(cell.date); }}
          onDrop={(event) => dropOnDate(event, cell.date)} onClick={(event) => { if ((event.target as HTMLElement).closest(".calendar-item")) return; onCreateTask(cell.date); }}>
          <strong>{cell.date.slice(-2)}</strong>
          {cell.events.map((event) => renderCard(event.content, event))}
          {workItems.map((item) => renderCard(item))}
        </div>;
      })}
    </div>
    <section aria-labelledby="unscheduled-heading"><h2 id="unscheduled-heading">ยังไม่กำหนดวัน</h2>{view.unscheduled.map((item) => renderCard(item))}</section>
    <ContentEditorDialog mode="edit" contentId={editingContentId} open={Boolean(editingContentId)} onClose={() => setEditingContentId(null)} />
  </section>;
}
