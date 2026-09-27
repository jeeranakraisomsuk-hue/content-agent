"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { StepStatus } from "../../domain/types";
import { addStandaloneActionTask, rescheduleProcessStep, rescheduleStandaloneActionTask, setProcessStepStatus, setStandaloneActionTaskStatus } from "../action-plan-commands";
import { selectActionPlan, selectActionPlanEntries, type ActionPlanEntry } from "../action-plan-selectors";

const WEEKDAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
const STATUS_LABELS: Record<StepStatus, string> = { todo: "รอทำ", doing: "กำลังทำ", done: "เสร็จแล้ว" };

type ActionStep = ActionPlanEntry;
type ActionDay = ReturnType<typeof selectActionPlan>["days"][number];

function stepKey(step: ActionStep): string {
  return step.kind === "standalone" ? `standalone:${step.id}` : `${step.contentId}:${step.id}`;
}

function calendarRows(days: ActionDay[], mode: "week" | "month"): (ActionDay | null)[][] {
  const firstWeekday = mode === "month" && days.length
    ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7
    : 0;
  const cells: (ActionDay | null)[] = [...Array.from({ length: firstWeekday }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function ActionPlanWorkspace() {
  const dashboard = useDashboardData();
  const [mode, setMode] = useState<"today" | "week" | "month">("today");
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));
  const [selectedDate, setSelectedDate] = useState(anchor);
  const [quickTitle, setQuickTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, StepStatus>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const view = useMemo(
    () => dashboard.state ? selectActionPlan(dashboard.state, { mode: mode === "today" ? "week" : mode, anchorDate: anchor }) : null,
    [dashboard.state, mode, anchor],
  );

  const allEntries = useMemo(() => dashboard.state ? selectActionPlanEntries(dashboard.state) : [], [dashboard.state]);

  if (!view) return <section><h1>Action Plan</h1><p>กำลังโหลดข้อมูล…</p></section>;

  const selectedDay = view.days.find((day) => day.date === selectedDate) ?? view.days[0];
  const rows = calendarRows(view.days, mode === "month" ? "month" : "week");
  const effectiveStatus = (step: ActionStep) => optimisticStatuses[stepKey(step)] ?? step.status;
  const todaySteps = allEntries.filter((step) => step.scheduledDate === anchor);
  const suggestions = allEntries.filter((step) => step.scheduledDate !== anchor && effectiveStatus(step) !== "done");
  const overdue = suggestions.filter((step) => step.scheduledDate && step.scheduledDate < anchor);
  const unscheduled = suggestions.filter((step) => !step.scheduledDate);
  const upcoming = suggestions.filter((step) => step.scheduledDate && step.scheduledDate > anchor);

  async function addQuickTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickTitle.trim() || isAdding) return;
    setIsAdding(true);
    setSaveError(null);
    try {
      await dashboard.mutate((state) => addStandaloneActionTask(state, {
        title: quickTitle, date: anchor, id: `content-${crypto.randomUUID()}`, now: new Date().toISOString(),
      }));
      setQuickTitle("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "เพิ่มงานไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsAdding(false);
    }
  }

  async function addSuggestion(step: ActionStep) {
    const key = stepKey(step);
    setPendingSuggestion(key);
    setSaveError(null);
    try {
      await dashboard.mutate((state) => step.kind === "standalone"
        ? rescheduleStandaloneActionTask(state, step.id, anchor, new Date().toISOString())
        : rescheduleProcessStep(state, step.contentId!, step.id, anchor, new Date().toISOString()));
    } catch {
      setSaveError("เพิ่มงานเข้าวันนี้ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setPendingSuggestion(null);
    }
  }

  async function updateStatus(step: ActionStep, status: StepStatus) {
    const key = stepKey(step);
    setPendingKey(key);
    setSaveError(null);
    setOptimisticStatuses((current) => ({ ...current, [key]: status }));
    try {
      await dashboard.mutate((state) => step.kind === "standalone"
        ? setStandaloneActionTaskStatus(state, step.id, status, new Date().toISOString())
        : setProcessStepStatus(state, step.contentId!, step.id, status, new Date().toISOString()));
    } catch {
      setSaveError("บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setOptimisticStatuses((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setPendingKey(null);
    }
  }

  function renderStep(step: ActionStep) {
    const key = stepKey(step);
    const status = effectiveStatus(step);
    return (
      <li key={key} className={`action-step-row is-${status}`}>
        <label>
          <input
            type="checkbox"
            aria-label={step.kind === "standalone" ? `ทำเสร็จ ${step.name}` : `ทำเสร็จ ${step.name} — ${step.contentTitle}`}
            checked={status === "done"}
            disabled={pendingKey === key}
            onChange={(event) => void updateStatus(step, event.target.checked ? "done" : "todo")}
          />
          <span><strong>{step.name}</strong>{step.kind === "content-step" && <small>{step.contentTitle}</small>}</span>
        </label>
        <span className="action-step-status">{STATUS_LABELS[status]}</span>
        {status === "todo" && <button type="button" disabled={pendingKey === key} onClick={() => void updateStatus(step, "doing")}>เริ่มทำ</button>}
      </li>
    );
  }

  function renderSuggestions(title: string, steps: ActionStep[]) {
    if (!steps.length) return null;
    return <section className="action-suggestion-group" aria-label={title} key={title}>
      <h3>{title}</h3>
      <ul>{steps.map((step) => <li key={stepKey(step)}>
        <span className="action-suggestion-circle" aria-hidden="true" />
        <span className="action-suggestion-copy"><strong>{step.name}</strong><small>{step.kind === "standalone" ? "งานทั่วไป" : step.contentTitle}{step.scheduledDate ? ` · ${step.scheduledDate}` : ""}</small></span>
        <button type="button" aria-label={`เพิ่มเข้าวันนี้ ${step.name}${step.kind === "content-step" ? ` — ${step.contentTitle}` : ""}`} disabled={pendingSuggestion === stepKey(step)} onClick={() => void addSuggestion(step)}>+</button>
      </li>)}</ul>
    </section>;
  }

  return (
    <section className="action-plan-workspace" aria-labelledby="action-plan-heading">
      <div className="workspace-heading-row">
        <div><p className="eyebrow">INDY / ACTION PLAN</p><h1 id="action-plan-heading">Action Plan</h1></div>
        <div className="action-plan-view-toggle" role="group" aria-label="มุมมอง Action Plan">
          <button type="button" aria-pressed={mode === "today"} onClick={() => setMode("today")}>วันนี้</button>
          <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")}>สัปดาห์</button>
          <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}>เดือน</button>
        </div>
      </div>

      <div className="action-plan-toolbar">
        <label>วันที่อ้างอิง<input type="date" value={anchor} onChange={(event) => {
          if (!event.target.value) return;
          setAnchor(event.target.value);
          setSelectedDate(event.target.value);
        }} /></label>
        <div className="action-summary" aria-label="สรุปสถานะขั้นตอน">
          <span>รอทำ <strong>{view.summary.todo}</strong></span>
          <span>กำลังทำ <strong>{view.summary.doing}</strong></span>
          <span>เสร็จแล้ว <strong>{view.summary.done}</strong></span>
        </div>
      </div>

      {mode === "today" ? <div className="action-today-layout">
        <section className="action-today-main" role="region" aria-label="งานของวันที่เลือก">
          <div className="action-today-heading"><div><p className="eyebrow">MY DAY / ACTION PLAN</p><h2>วันของฉัน</h2><p>เลือกงานที่ต้องโฟกัส แล้วติ๊กเมื่อทำเสร็จ</p></div><span>{anchor}</span></div>
          <form className="action-quick-add" onSubmit={(event) => void addQuickTask(event)}>
            <span aria-hidden="true">○</span>
            <input type="text" aria-label="เพิ่มงานทั่วไป" placeholder="เพิ่มงานทั่วไป เช่น ถ่ายรูป หรือซื้อของ" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} disabled={isAdding} />
            <button type="submit" disabled={isAdding || !quickTitle.trim()}>{isAdding ? "กำลังเพิ่ม…" : "เพิ่มงาน"}</button>
          </form>
          {todaySteps.length > 0
            ? <ul className="action-step-list action-today-list">{todaySteps.map(renderStep)}</ul>
            : <p className="action-plan-empty">ยังไม่มีงานในวันนี้ เพิ่มงานหรือเลือกจากคำแนะนำได้เลย</p>}
        </section>
        <aside className="action-today-suggestions" role="region" aria-label="คำแนะนำ">
          <div className="action-suggestions-heading"><div><p className="eyebrow">NEXT UP</p><h2>คำแนะนำ</h2></div><span>{suggestions.length} งาน</span></div>
          {renderSuggestions("ค้างจากวันก่อน", overdue)}
          {renderSuggestions("ยังไม่กำหนดวัน", unscheduled)}
          {renderSuggestions("วันถัดไป", upcoming)}
          {suggestions.length === 0 && <p className="action-plan-empty">ไม่มีงานค้างให้เพิ่มในวันนี้</p>}
        </aside>
      </div> : <>
      <div className={`action-calendar action-calendar--${mode}`} role="grid" aria-label="ปฏิทิน Action Plan">
        <div className="action-calendar-row action-calendar-weekdays" role="row">
          {WEEKDAYS.map((weekday) => <span key={weekday} role="columnheader">{weekday}</span>)}
        </div>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="action-calendar-row" role="row">
            {row.map((day, columnIndex) => (
              <div key={day?.date ?? `empty-${columnIndex}`} role="gridcell" className="action-calendar-cell">
                {day && <button
                  type="button"
                  aria-label={`เลือกวันที่ ${day.date}`}
                  aria-pressed={selectedDay?.date === day.date}
                  className={`action-calendar-day${day.steps.some((step) => effectiveStatus(step) === "done") ? " has-done" : ""}`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <span className="action-calendar-day-number">{day.date.slice(-2)}</span>
                  {day.steps.length > 0 && <span className="action-calendar-count">{day.steps.length} งาน</span>}
                  {mode === "week" && day.steps.slice(0, 2).map((step) => <span key={stepKey(step)} className={`action-calendar-step is-${effectiveStatus(step)}`}>{step.name}</span>)}
                  {mode === "week" && day.steps.length > 2 && <small>+{day.steps.length - 2} งาน</small>}
                </button>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <section className="action-day-detail" aria-labelledby="action-selected-day-heading">
        <div className="action-day-detail-heading">
          <div><p className="eyebrow">เช็กลิสต์ประจำวัน</p><h2 id="action-selected-day-heading">{selectedDay?.date ?? anchor}</h2></div>
          <span>{selectedDay?.steps.length ?? 0} ขั้นตอน</span>
        </div>
        {selectedDay?.steps.length
          ? <ul className="action-step-list">{selectedDay.steps.map(renderStep)}</ul>
          : <p className="action-plan-empty">วันนี้ยังไม่มีขั้นตอนงาน</p>}
      </section>

      <section className="action-unscheduled" aria-labelledby="action-unscheduled-heading">
        <div className="action-day-detail-heading"><h2 id="action-unscheduled-heading">ยังไม่กำหนดวัน</h2><span>{view.unscheduled.length} ขั้นตอน</span></div>
        {view.unscheduled.length > 0 && <ul className="action-step-list">{view.unscheduled.map(renderStep)}</ul>}
      </section>
      </>}
      {saveError && <p className="action-plan-error" role="alert">{saveError}</p>}
    </section>
  );
}
