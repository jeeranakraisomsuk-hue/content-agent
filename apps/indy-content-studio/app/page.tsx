"use client";

import { useState } from "react";
import { AppShell, navigationItems, type WorkspaceItem } from "./AppShell";
import { DashboardPreview } from "../features/dashboard/components/DashboardPreview";
import { TodayOverview, type TodayOverviewState } from "../features/dashboard/components/TodayOverview";
import { CreateContentModal, type CreateContentInput } from "../features/dashboard/components/CreateContentModal";
import { TaskDetailDrawer } from "../features/dashboard/components/TaskDetailDrawer";
import { LineSendConfirmation } from "../features/dashboard/components/LineSendConfirmation";
import { ProductionBoard } from "../features/content/components/ProductionBoard";
import type { DashboardTask } from "../features/dashboard/dashboard-model";
import { useDashboardWorkspace } from "../features/dashboard/useDashboardWorkspace";

const initialTasks: DashboardTask[] = [
  { id: "reels", title: "ตัดต่อคลิป Reels เทคนิคทรงผม", priority: "urgent", scheduledTime: "10:30", workflowStage: "ตัดต่อ", lastWorkedAt: "2026-09-18T10:18:00.000Z" },
  { id: "caption", title: "ตรวจแคปชันคอร์สเดือนตุลาคม", priority: "high", scheduledTime: "13:00", workflowStage: "รออนุมัติ", lastWorkedAt: "2026-09-18T09:42:00.000Z" },
  { id: "assets", title: "คัดภาพผลงานนักเรียน", priority: "normal", scheduledTime: "15:30", workflowStage: "เตรียมไฟล์", lastWorkedAt: "2026-09-17T16:30:00.000Z" },
];

const workspaceLabels = Object.fromEntries(navigationItems.map((item) => [item.id, item.label])) as Record<WorkspaceItem, string>;

function DeferredWorkspace({ item }: { item: Exclude<WorkspaceItem, "overview" | "production-board"> }) {
  return <section aria-labelledby="workspace-heading"><p className="eyebrow">WORKSPACE</p><h1 id="workspace-heading">{workspaceLabels[item]}</h1><p>กำลังจัดเตรียมพื้นที่งานนี้</p><p>เมนูนี้เปิดพื้นที่ทำงานได้แล้ว และจะแสดงข้อมูลเมื่อฟีเจอร์ส่วนนั้นพร้อมใช้งาน</p></section>;
}

export default function HomePage() {
  const [todayTasks, setTodayTasks] = useState<DashboardTask[]>(initialTasks);
  const workspace = useDashboardWorkspace(todayTasks);
  const [todayState, setTodayState] = useState<TodayOverviewState>("ready");
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceItem>("overview");
  const [continuationNotice, setContinuationNotice] = useState<string | null>(null);
  const [isLineConfirmationOpen, setLineConfirmationOpen] = useState(false);
  const selectedTask = todayTasks.find((task) => task.id === workspace.selectedTaskId);

  function continueSelectedTask() {
    if (selectedTask) setContinuationNotice(`พร้อมทำงานต่อที่ขั้นตอน ${selectedTask.workflowStage}`);
  }

  function createTask(input: CreateContentInput) {
    const task: DashboardTask = { id: `task-${Date.now()}`, priority: "normal", workflowStage: "วางแผน", lastWorkedAt: new Date().toISOString(), ...input, scheduledTime: input.scheduledTime || "ยังไม่กำหนด" };
    setTodayTasks((current) => [...current, task]);
    workspace.setCreateOpen(false);
    workspace.openTask(task.id);
  }

  return <AppShell activeItem={activeWorkspace} onNavigate={setActiveWorkspace}>
    <main>
      {activeWorkspace === "overview" && <>
        <TodayOverview tasks={todayTasks} state={todayState} onOpenTask={(task) => { setContinuationNotice(null); workspace.openTask(task.id); }} onResumeLatest={workspace.resumeLatest} onRetry={() => setTodayState("ready")} />
        <button type="button" className="create-task-button" onClick={() => workspace.setCreateOpen(true)}>สร้างชิ้นงานใหม่</button>
        {selectedTask ? <section className="selected-workflow" aria-label={`ทำงานต่อกับ ${selectedTask.title}`}><p className="eyebrow">กำลังทำงานต่อ</p><h2>{selectedTask.title}</h2><p>ขั้นตอนปัจจุบัน: {selectedTask.workflowStage}</p><button type="button" className="continue-work-button" onClick={continueSelectedTask}>ดำเนินงานต่อที่ขั้นตอน {selectedTask.workflowStage}</button>{continuationNotice && <p className="continuation-notice" role="status">{continuationNotice}</p>}</section> : <p className="selected-workflow-hint" aria-live="polite">เลือกงานเพื่อเปิดขั้นตอนการทำงาน</p>}
        <DashboardPreview />
        <TaskDetailDrawer task={selectedTask ?? null} onClose={() => { setLineConfirmationOpen(false); workspace.closeTask(); }} onRequestSend={() => setLineConfirmationOpen(true)} />
        <LineSendConfirmation task={selectedTask ?? null} open={isLineConfirmationOpen} onCancel={() => setLineConfirmationOpen(false)} onConfirm={async () => { if (!selectedTask) return; setTodayTasks((current) => current.map((task) => task.id === selectedTask.id ? { ...task, lineDeliveryStatus: "sent", lineDeliveryReceipt: "ส่งถึง PRIK GN แล้ว" } : task)); }} />
        <CreateContentModal open={workspace.isCreateOpen} onClose={() => workspace.setCreateOpen(false)} onCreate={createTask} />
      </>}
      {activeWorkspace === "production-board" && <ProductionBoard items={todayTasks.map((task) => ({ id: task.id, title: task.title, status: task.workflowStage ?? "วางแผน" }))} />}
      {activeWorkspace !== "overview" && activeWorkspace !== "production-board" && <DeferredWorkspace item={activeWorkspace} />}
    </main>
  </AppShell>;
}
