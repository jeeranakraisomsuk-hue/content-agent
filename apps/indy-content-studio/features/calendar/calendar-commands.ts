import type { DashboardState } from "../domain/types";
import { createBangkokScheduleTimestamp, formatBangkokSchedule } from "./schedule-time";

export function movePlatformSchedule(state: DashboardState, contentId: string, platform: string, date: string, now: string): DashboardState {
  const item = state.contents.find((content) => content.id === contentId);
  if (!item) throw new Error("ไม่พบชิ้นงาน");
  const schedule = item.schedules.find((candidate) => candidate.platform === platform && candidate.enabled && candidate.publishAt);
  if (!schedule?.publishAt) throw new Error("ยังไม่ได้กำหนดเวลาของช่องทางนี้");
  const { time } = formatBangkokSchedule(schedule.publishAt);
  return {
    ...state,
    contents: state.contents.map((content) => content.id !== contentId ? content : {
      ...content,
      schedules: content.schedules.map((candidate) => candidate.platform === platform
        ? { ...candidate, publishAt: createBangkokScheduleTimestamp(date, time) }
        : candidate),
      updatedAt: now,
    }),
  };
}

export function moveContentSchedules(state: DashboardState, contentId: string, date: string, platforms: string[], now: string): DashboardState {
  const item = state.contents.find((content) => content.id === contentId);
  if (!item) throw new Error("ไม่พบชิ้นงาน");

  return {
    ...state,
    contents: state.contents.map((content) => {
      if (content.id !== contentId) return content;

      const plannedTime = content.plannedWorkAt?.slice(10) ?? "";
      const plannedDate = content.plannedWorkAt?.slice(0, 10) ?? null;
      return {
        ...content,
        plannedWorkAt: `${date}${plannedTime}`,
        readyDate: plannedDate && content.readyDate === plannedDate ? date : content.readyDate,
        schedules: content.schedules.map((schedule) =>
            platforms.includes(schedule.platform) && schedule.enabled && schedule.publishAt
            ? {
              ...schedule,
              publishAt: /[zZ]|[+-]\d{2}:?\d{2}$/.test(schedule.publishAt)
                ? createBangkokScheduleTimestamp(date, formatBangkokSchedule(schedule.publishAt).time)
                : `${date}T${formatBangkokSchedule(schedule.publishAt).time}`,
            }
            : schedule,
        ),
        updatedAt: now,
      };
    }),
  };
}

export function unscheduleContent(state: DashboardState, contentId: string, platform: string, now: string): DashboardState {
  return {
    ...state,
    contents: state.contents.map((content) => content.id === contentId
      ? {
          ...content,
          schedules: content.schedules.map((schedule) => schedule.platform === platform
            ? { ...schedule, publishAt: null, enabled: false }
            : schedule,
          ),
          updatedAt: now,
        }
      : content,
    ),
  };
}
