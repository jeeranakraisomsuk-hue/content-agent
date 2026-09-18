"use client";

import { AppShell } from "./AppShell";
import { DashboardPreview } from "../features/dashboard/components/DashboardPreview";
import { TodayOverview, type TodayOverviewState } from "../features/dashboard/components/TodayOverview";
import { CreateContentModal, type CreateContentInput } from "../features/dashboard/components/CreateContentModal";
import { TaskDetailDrawer } from "../features/dashboard/components/TaskDetailDrawer";
import type { DashboardTask } from "../features/dashboard/dashboard-model";
import { useDashboardWorkspace } from "../features/dashboard/useDashboardWorkspace";
import { useState } from "react";

const initialTasks: DashboardTask[] = [
  { id: "reels", title: "ตัดต่อคลิป Reels เทคนิคทรงผม", priority: "urgent" as const, scheduledTime: "10:30", workflowStage: "ตัดต่อ", lastWorkedAt: "2026-09-18T10:18:00.000Z" },
  { id: "caption", title: "ตรวจแคปชันคอร์สเดือนตุลาคม", priority: "high" as const, scheduledTime: "13:00", workflowStage: "รออนุมัติ", lastWorkedAt: "2026-09-18T09:42:00.000Z" },
  { id: "assets", title: "คัดภาพผลงานนักเรียน", priority: "normal" as const, scheduledTime: "15:30", workflowStage: "เตรียมไฟล์", lastWorkedAt: "2026-09-17T16:30:00.000Z" },
];

export default function HomePage() {
  const [todayTasks, setTodayTasks] = useState<DashboardTask[]>(initialTasks);
  const workspace = useDashboardWorkspace(todayTasks);
  const [todayState, setTodayState] = useState<TodayOverviewState>("ready");
  const [continuationNotice, setContinuationNotice] = useState<string | null>(null);
  const selectedTask = todayTasks.find((task) => task.id === workspace.selectedTaskId);

  function continueSelectedTask() {
    if (selectedTask) {
      setContinuationNotice(`พร้อมทำงานต่อที่ขั้นตอน ${selectedTask.workflowStage}`);
    }
  }

  function createTask(input: CreateContentInput) {
    const scheduledTime = input.scheduledTime ? new Date(input.scheduledTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "ยังไม่กำหนด";
    const task: DashboardTask = {
      id: `task-${Date.now()}`,
      title: input.title,
      priority: "normal",
      scheduledTime,
      workflowStage: "วางแผน",
      lastWorkedAt: new Date().toISOString(),
    };

    setTodayTasks((current) => [...current, task]);
    workspace.setCreateOpen(false);
    workspace.openTask(task.id);
  }

  return (
    <AppShell>
      <main>
        <TodayOverview
          tasks={todayTasks}
          state={todayState}
          onOpenTask={(task) => {
            setContinuationNotice(null);
            workspace.openTask(task.id);
          }}
          onResumeLatest={workspace.resumeLatest}
          onRetry={() => setTodayState("ready")}
        />
        <button type="button" className="create-task-button" onClick={() => workspace.setCreateOpen(true)}>สร้างชิ้นงานใหม่</button>
        {selectedTask ? (
          <section className="selected-workflow" aria-label={`ทำงานต่อกับ ${selectedTask.title}`}>
            <p className="eyebrow">กำลังทำงานต่อ</p>
            <h2>{selectedTask.title}</h2>
            <p>ขั้นตอนปัจจุบัน: {selectedTask.workflowStage}</p>
            <button type="button" className="continue-work-button" onClick={continueSelectedTask}>
              ดำเนินงานต่อที่ขั้นตอน {selectedTask.workflowStage}
            </button>
            {continuationNotice && <p className="continuation-notice" role="status">{continuationNotice}</p>}
          </section>
        ) : (
          <p className="selected-workflow-hint" aria-live="polite">เลือกงานเพื่อเปิดขั้นตอนการทำงาน</p>
        )}
        <DashboardPreview />
        <TaskDetailDrawer task={selectedTask ?? null} onClose={workspace.closeTask} onRequestSend={() => undefined} />
        <CreateContentModal open={workspace.isCreateOpen} onClose={() => workspace.setCreateOpen(false)} onCreate={createTask} />
      </main>
    </AppShell>
  );
}
