"use client";

import { useMemo, useState } from "react";
import { AppShell, navigationItems, type WorkspaceItem } from "./AppShell";
import { DashboardPreview } from "../features/dashboard/components/DashboardPreview";
import { TodayOverview, type TodayOverviewState } from "../features/dashboard/components/TodayOverview";
import { CreateContentModal, type CreateContentInput } from "../features/dashboard/components/CreateContentModal";
import { TaskDetailDrawer } from "../features/dashboard/components/TaskDetailDrawer";
import { LineSendConfirmation } from "../features/dashboard/components/LineSendConfirmation";
import { ProductionBoard } from "../features/content/components/ProductionBoard";
import { dashboardTaskFromContent, dashboardTaskToContent, dashboardTaskToMedia, type DashboardTask } from "../features/dashboard/dashboard-model";
import { useDashboardWorkspace } from "../features/dashboard/useDashboardWorkspace";
import { DashboardDataProvider, useDashboardData } from "../features/data/DashboardDataProvider";
import { upsertContent } from "../features/data/dashboard-commands";
import type { DashboardRepository } from "../features/data/dashboard-repository";
import { SettingsWorkspace } from "../features/settings/components/SettingsWorkspace";
import { MediaLibraryWorkspace } from "../features/media/components/MediaLibraryWorkspace";
import { ReferencesWorkspace } from "../features/references/components/ReferencesWorkspace";
import { CaptionTemplatesWorkspace } from "../features/captions/components/CaptionTemplatesWorkspace";

const initialTasks: DashboardTask[] = [
  { id: "reels", title: "ตัดต่อคลิป Reels เทคนิคทรงผม", priority: "urgent", scheduledTime: "10:30", workflowStage: "ตัดต่อ", lastWorkedAt: "2026-09-18T10:18:00.000Z" },
  { id: "caption", title: "ตรวจแคปชันคอร์สเดือนตุลาคม", priority: "high", scheduledTime: "13:00", workflowStage: "รออนุมัติ", lastWorkedAt: "2026-09-18T09:42:00.000Z" },
  { id: "assets", title: "คัดภาพผลงานนักเรียน", priority: "normal", scheduledTime: "15:30", workflowStage: "เตรียมไฟล์", lastWorkedAt: "2026-09-17T16:30:00.000Z" },
];

const workspaceLabels = Object.fromEntries(navigationItems.map((item) => [item.id, item.label])) as Record<WorkspaceItem, string>;

function DeferredWorkspace({ item }: { item: Exclude<WorkspaceItem, "overview" | "production-board"> }) {
  return <section aria-labelledby="workspace-heading"><p className="eyebrow">WORKSPACE</p><h1 id="workspace-heading">{workspaceLabels[item]}</h1><p>กำลังจัดเตรียมพื้นที่งานนี้</p><p>เมนูนี้เปิดพื้นที่ทำงานได้แล้ว และจะแสดงข้อมูลเมื่อฟีเจอร์ส่วนนั้นพร้อมใช้งาน</p></section>;
}

function HomePageContent() {
  const dashboard = useDashboardData();
  const [draftTasks, setDraftTasks] = useState<DashboardTask[]>(initialTasks);
  const persistedTasks = useMemo(() => {
    if (!dashboard.state) return [];
    return dashboard.state.contents
      .filter((content) => !content.deletedAt)
      .map((content) => dashboardTaskFromContent(content, dashboard.state!));
  }, [dashboard.state]);
  const todayTasks = useMemo(() => {
    const persistedIds = new Set(persistedTasks.map((task) => task.id));
    return [...persistedTasks, ...draftTasks.filter((task) => !persistedIds.has(task.id))];
  }, [draftTasks, persistedTasks]);
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
    setDraftTasks((current) => [...current, task]);
    void saveTask(task);
    workspace.setCreateOpen(false);
    workspace.openTask(task.id);
  }

  async function saveTask(task: DashboardTask) {
    const now = new Date().toISOString();
    await dashboard.mutate((current) => {
      const taskMedia = dashboardTaskToMedia(task, now);
      const mediaIds = new Set(taskMedia.map((asset) => asset.id));
      return upsertContent({
        ...current,
        media: [...current.media.filter((asset) => !mediaIds.has(asset.id)), ...taskMedia],
      }, dashboardTaskToContent(task, current, now));
    });
  }

  return <AppShell activeItem={activeWorkspace} onNavigate={setActiveWorkspace}>
    <main>
      {activeWorkspace === "overview" && <>
        <TodayOverview tasks={todayTasks} state={todayState} onOpenTask={(task) => { setContinuationNotice(null); workspace.openTask(task.id); }} onResumeLatest={workspace.resumeLatest} onRetry={() => setTodayState("ready")} />
        <button type="button" className="create-task-button" onClick={() => workspace.setCreateOpen(true)}>สร้างชิ้นงานใหม่</button>
        {selectedTask ? <section className="selected-workflow" aria-label={`ทำงานต่อกับ ${selectedTask.title}`}><p className="eyebrow">กำลังทำงานต่อ</p><h2>{selectedTask.title}</h2><p>ขั้นตอนปัจจุบัน: {selectedTask.workflowStage}</p><button type="button" className="continue-work-button" onClick={continueSelectedTask}>ดำเนินงานต่อที่ขั้นตอน {selectedTask.workflowStage}</button>{continuationNotice && <p className="continuation-notice" role="status">{continuationNotice}</p>}</section> : <p className="selected-workflow-hint" aria-live="polite">เลือกงานเพื่อเปิดขั้นตอนการทำงาน</p>}
        <DashboardPreview />
        <TaskDetailDrawer task={selectedTask ?? null} onClose={() => { setLineConfirmationOpen(false); workspace.closeTask(); }} onRequestSend={() => setLineConfirmationOpen(true)} />
        <LineSendConfirmation task={selectedTask ?? null} open={isLineConfirmationOpen} onCancel={() => setLineConfirmationOpen(false)} onConfirm={async () => {
          if (!selectedTask) return;
          const sentTask = { ...selectedTask, lineDeliveryStatus: "sent" as const, lineDeliveryReceipt: "ส่งถึง PRIK GN แล้ว" };
          setDraftTasks((current) => current.map((task) => task.id === sentTask.id ? sentTask : task));
          await saveTask(sentTask);
        }} />
        <CreateContentModal open={workspace.isCreateOpen} onClose={() => workspace.setCreateOpen(false)} onCreate={createTask} />
      </>}
      {activeWorkspace === "production-board" && <ProductionBoard items={todayTasks.map((task) => ({ id: task.id, title: task.title, status: task.workflowStage ?? "วางแผน" }))} />}
      {activeWorkspace === "settings" && <SettingsWorkspace />}
      {activeWorkspace === "media-library" && <MediaLibraryWorkspace />}
      {activeWorkspace === "references" && <ReferencesWorkspace />}
      {activeWorkspace === "caption-templates" && <CaptionTemplatesWorkspace />}
      {activeWorkspace !== "overview" && activeWorkspace !== "production-board" && activeWorkspace !== "settings" && activeWorkspace !== "media-library" && activeWorkspace !== "references" && activeWorkspace !== "caption-templates" && <DeferredWorkspace item={activeWorkspace} />}
    </main>
  </AppShell>;
}

export function HomePage({ repository }: { repository?: DashboardRepository } = {}) {
  return <DashboardDataProvider repository={repository}><HomePageContent /></DashboardDataProvider>;
}
