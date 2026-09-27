import type { DashboardState, ContentItem } from "../domain/types";
import { createBangkokScheduleTimestamp, formatBangkokSchedule } from "../calendar/schedule-time";
import { copyContentAsNew } from "./content-commands";

export type CopyCadence = "daily" | "every-other-day" | "weekdays";
export type RecurrenceOptions = { count: number; cadence: CopyCadence; startDate?: string };

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("วันที่เริ่มสำเนาไม่ถูกต้อง");
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("วันที่เริ่มสำเนาไม่ถูกต้อง");
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

function dayDifference(left: string, right: string): number {
  return Math.round((parseDate(left).getTime() - parseDate(right).getTime()) / 86_400_000);
}

export function getRecurringCopyDates(anchorDate: string, count: number, cadence: CopyCadence): string[] {
  parseDate(anchorDate);
  if (!Number.isInteger(count) || count < 1 || count > 365) throw new Error("จำนวนสำเนาต้องอยู่ระหว่าง 1 ถึง 365");
  const dates: string[] = [];
  let candidate = anchorDate;
  while (dates.length < count) {
    candidate = addDays(candidate, cadence === "every-other-day" ? 2 : 1);
    if (cadence === "weekdays") {
      while ([0, 6].includes(parseDate(candidate).getUTCDay())) candidate = addDays(candidate, 1);
    }
    dates.push(candidate);
  }
  return dates;
}

function getSourceAnchor(source: ContentItem, startDate?: string): string {
  if (startDate) return startDate;
  if (source.plannedWorkAt) return source.plannedWorkAt.slice(0, 10);
  const scheduleDates = source.schedules.filter((schedule) => schedule.enabled && schedule.publishAt).map((schedule) => formatBangkokSchedule(schedule.publishAt!).date).sort();
  if (scheduleDates[0]) return scheduleDates[0];
  throw new Error("งานนี้ยังไม่มีวันที่เริ่มต้น กรุณาเลือกวันที่เริ่มสำเนา");
}

function shiftScheduleDate(publishAt: string, sourceAnchor: string, targetDate: string): string {
  const formatted = formatBangkokSchedule(publishAt);
  const shiftedDate = addDays(targetDate, dayDifference(formatted.date, sourceAnchor));
  return createBangkokScheduleTimestamp(shiftedDate, formatted.time);
}

function shiftWorkDate(value: string | null, sourceAnchor: string, targetDate: string): string | null {
  if (!value) return null;
  return `${addDays(targetDate, dayDifference(value.slice(0, 10), sourceAnchor))}${value.length > 10 ? value.slice(10) : ""}`;
}

export function createRecurringCopies(
  state: DashboardState,
  sourceId: string,
  options: RecurrenceOptions,
  now: string,
  createId: (index: number) => string,
): DashboardState {
  const source = state.contents.find((content) => content.id === sourceId && !content.deletedAt);
  if (!source) throw new Error("ไม่พบงานต้นฉบับ");
  const sourceAnchor = getSourceAnchor(source, options.startDate);
  const dates = getRecurringCopyDates(sourceAnchor, options.count, options.cadence);
  const copies = dates.map((targetDate, index) => {
    const copy = copyContentAsNew(source, createId(index), now);
    return {
      ...copy,
      schedules: source.schedules.map((schedule) => ({
        ...schedule,
        publishAt: schedule.enabled && schedule.publishAt ? shiftScheduleDate(schedule.publishAt, source.plannedWorkAt?.slice(0, 10) ?? sourceAnchor, targetDate) : null,
        latestAttemptId: null,
        manualEvidence: null,
      })),
      plannedWorkAt: shiftWorkDate(source.plannedWorkAt, source.plannedWorkAt?.slice(0, 10) ?? sourceAnchor, targetDate),
      readyDate: source.readyDate ? addDays(targetDate, dayDifference(source.readyDate, source.plannedWorkAt?.slice(0, 10) ?? sourceAnchor)) : null,
      updatedAt: now,
    };
  });
  return { ...state, contents: [...state.contents, ...copies] };
}
