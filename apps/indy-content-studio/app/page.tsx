"use client";

import { AppShell } from "./AppShell";
import { DashboardPreview } from "../features/dashboard/components/DashboardPreview";
import { TodayOverview } from "../features/dashboard/components/TodayOverview";
import { useDashboardWorkspace } from "../features/dashboard/useDashboardWorkspace";

const todayTasks = [
  { id: "reels", title: "ตัดต่อคลิป Reels เทคนิคทรงผม", priority: "urgent" as const, scheduledTime: "10:30", workflowStage: "ตัดต่อ", lastWorkedAt: "2026-09-18T10:18:00.000Z" },
  { id: "caption", title: "ตรวจแคปชันคอร์สเดือนตุลาคม", priority: "high" as const, scheduledTime: "13:00", workflowStage: "รออนุมัติ", lastWorkedAt: "2026-09-18T09:42:00.000Z" },
  { id: "assets", title: "คัดภาพผลงานนักเรียน", priority: "normal" as const, scheduledTime: "15:30", workflowStage: "เตรียมไฟล์", lastWorkedAt: "2026-09-17T16:30:00.000Z" },
];

export default function HomePage() {
  const workspace = useDashboardWorkspace(todayTasks);

  return (
    <AppShell>
      <main>
        <TodayOverview
          tasks={todayTasks}
          state="ready"
          onOpenTask={(task) => workspace.openTask(task.id)}
          onResumeLatest={workspace.resumeLatest}
        />
        <p className="selected-workflow" aria-live="polite">
          {workspace.selectedTaskId ? `เปิดขั้นตอนทำงานของ ${todayTasks.find((task) => task.id === workspace.selectedTaskId)?.title}` : "เลือกงานเพื่อเปิดขั้นตอนการทำงาน"}
        </p>
        <DashboardPreview />
      </main>
    </AppShell>
  );
}
