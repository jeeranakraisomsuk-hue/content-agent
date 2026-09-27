import type { ContentItem, DashboardState, Platform, PublicationAttempt } from "../domain/types";
import { compareScheduleTimestamps, formatBangkokSchedule } from "./schedule-time";

export { createBangkokScheduleTimestamp, formatBangkokSchedule } from "./schedule-time";

export type CalendarPlatformFilter = Platform | "all";
export type CalendarEventStatus = "not-started" | "in-progress" | "published";
export type CalendarEvent = {
  id: string;
  content: ContentItem;
  platform: Platform | null;
  publishAt: string | null;
  date: string;
  time: string | null;
  status: CalendarEventStatus;
};

function hasEnabledPublicationSchedule(content: ContentItem) {
  return content.schedules.some((schedule) => schedule.enabled && Boolean(schedule.publishAt));
}

function getPlannedDate(content: ContentItem) {
  const date = content.plannedWorkAt?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function getPlatformScheduleState(
  schedule: { publishAt: string | null; enabled: boolean; latestAttemptId?: string | null; manualEvidence?: unknown },
  now: string,
  attempts: ReadonlyArray<Pick<PublicationAttempt, "id" | "status">> = [],
) {
  const attempt = schedule.latestAttemptId ? attempts.find((candidate) => candidate.id === schedule.latestAttemptId) : undefined;
  if (schedule.manualEvidence || attempt?.status === "published") return "published";
  if (!schedule.enabled || !schedule.publishAt) return "unscheduled";
  return compareScheduleTimestamps(schedule.publishAt, now) < 0 ? "overdue" : "scheduled";
}

function getEventStatus(state: DashboardState, content: ContentItem, platform: Platform, schedule: ContentItem["schedules"][number]): CalendarEventStatus {
  const latestAttempt = schedule.latestAttemptId
    ? state.publicationAttempts.find((attempt) => attempt.id === schedule.latestAttemptId)
    : undefined;
  if (schedule.manualEvidence || latestAttempt?.status === "published") return "published";
  return content.productionStatus === "waiting-shoot" ? "not-started" : "in-progress";
}

function getContentEvents(state: DashboardState, content: ContentItem, platform: CalendarPlatformFilter): CalendarEvent[] {
  if (platform === "all" || platform === undefined) {
    return content.schedules
      .filter((schedule) => schedule.enabled && schedule.publishAt)
      .map((schedule) => {
        const formatted = formatBangkokSchedule(schedule.publishAt!);
        return { id: `${content.id}:${schedule.platform}`, content, platform: schedule.platform, publishAt: schedule.publishAt, date: formatted.date, time: formatted.time, status: getEventStatus(state, content, schedule.platform, schedule) };
      });
  }
  return content.schedules
    .filter((schedule) => schedule.platform === platform && schedule.enabled && schedule.publishAt)
    .map((schedule) => {
      const formatted = formatBangkokSchedule(schedule.publishAt!);
      return { id: `${content.id}:${schedule.platform}`, content, platform: schedule.platform, publishAt: schedule.publishAt, date: formatted.date, time: formatted.time, status: getEventStatus(state, content, schedule.platform, schedule) };
    });
}

export function buildCalendarMonth(state: DashboardState, filters: { month: string; categoryId?: string; formatId?: string; platform?: CalendarPlatformFilter }) {
  const selectedPlatform = filters.platform ?? "all";
  const contents = state.contents.filter((content) =>
    !content.deletedAt
    && (!filters.categoryId || content.categoryId === filters.categoryId)
    && (!filters.formatId || content.formatId === filters.formatId),
  );
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(`${filters.month}-01T00:00:00Z`);
    date.setUTCDate(index - date.getUTCDay() + 1);
    const day = date.toISOString().slice(0, 10);
    const events = contents.flatMap((content) => getContentEvents(state, content, selectedPlatform))
      .filter((event) => event.date === day)
      .sort((left, right) => compareScheduleTimestamps(left.publishAt!, right.publishAt!) || (left.platform ?? "").localeCompare(right.platform ?? ""));
    const items = contents.filter((content) => {
      const plannedDate = getPlannedDate(content);
      return (selectedPlatform === "all" && plannedDate === day) || events.some((event) => event.content.id === content.id);
    });
    return {
      date: day,
      inMonth: day.startsWith(filters.month),
      items,
      events,
    };
  });
  const unscheduled = contents.filter((content) => selectedPlatform === "all" && !getPlannedDate(content) && !hasEnabledPublicationSchedule(content));

  return { month: filters.month, cells, unscheduled };
}
