"use client";

import { useMemo, useState } from "react";
import { AppShell, type WorkspaceItem } from "./AppShell";
import { TodayOverview, type TodayOverviewState } from "../features/dashboard/components/TodayOverview";
import { CreateContentModal, type CreateContentInput } from "../features/dashboard/components/CreateContentModal";
import { TaskDetailDrawer } from "../features/dashboard/components/TaskDetailDrawer";
import { LineSendConfirmation } from "../features/dashboard/components/LineSendConfirmation";
import { dashboardTaskFromContent, dashboardTaskToContent, dashboardTaskToMedia, type DashboardTask } from "../features/dashboard/dashboard-model";
import { useDashboardWorkspace } from "../features/dashboard/useDashboardWorkspace";
import { DashboardDataProvider, useDashboardData } from "../features/data/DashboardDataProvider";
import { upsertContent } from "../features/data/dashboard-commands";
import type { DashboardRepository } from "../features/data/dashboard-repository";
import { SettingsWorkspace } from "../features/settings/components/SettingsWorkspace";
import { MediaLibraryWorkspace } from "../features/media/components/MediaLibraryWorkspace";
import { ReferencesWorkspace } from "../features/references/components/ReferencesWorkspace";
import { CaptionTemplatesWorkspace } from "../features/captions/components/CaptionTemplatesWorkspace";
import { ContentEditorDialog } from "../features/content/components/ContentEditorDialog";
import { OverviewWorkspace } from "../features/overview/components/OverviewWorkspace";
import { ContentCalendarWorkspace } from "../features/calendar/components/ContentCalendarWorkspace";
import { ActionPlanWorkspace } from "../features/action-plan/components/ActionPlanWorkspace";
import { ProductionBoardWorkspace } from "../features/production/components/ProductionBoardWorkspace";
import { CorrectionsWorkspace } from "../features/line-oa/components/CorrectionsWorkspace";
import { MakeDeliveryWorkspace } from "../features/publication/components/MakeDeliveryWorkspace";

function HomePageContent() {
  const dashboard = useDashboardData();
  const [draftTasks, setDraftTasks] = useState<DashboardTask[]>([]);
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
  const [isFullEditorOpen, setFullEditorOpen] = useState(false);
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
        <OverviewWorkspace />
        <button type="button" className="create-task-button" onClick={() => setFullEditorOpen(true)}>เปิดตัวแก้ไขคอนเทนต์เต็ม</button>
        <ContentEditorDialog mode={selectedTask ? "edit" : "create"} contentId={selectedTask?.id} open={isFullEditorOpen} onClose={() => setFullEditorOpen(false)} />
        <TaskDetailDrawer task={selectedTask ?? null} onClose={() => { setLineConfirmationOpen(false); workspace.closeTask(); }} onRequestSend={() => setLineConfirmationOpen(true)} />
        <LineSendConfirmation task={selectedTask ?? null} open={isLineConfirmationOpen} onCancel={() => setLineConfirmationOpen(false)} onConfirm={async () => {
          if (!selectedTask) return;
          const sentTask = { ...selectedTask, lineDeliveryStatus: "sent" as const, lineDeliveryReceipt: "ส่งถึง PRIK GN แล้ว" };
          setDraftTasks((current) => current.map((task) => task.id === sentTask.id ? sentTask : task));
          await saveTask(sentTask);
        }} />
        <CreateContentModal open={workspace.isCreateOpen} onClose={() => workspace.setCreateOpen(false)} onCreate={createTask} />
      </>}
      {activeWorkspace === "production-board" && <ProductionBoardWorkspace />}
      {activeWorkspace === "settings" && <SettingsWorkspace />}
      {activeWorkspace === "media-library" && <MediaLibraryWorkspace />}
      {activeWorkspace === "references" && <ReferencesWorkspace />}
      {activeWorkspace === "caption-templates" && <CaptionTemplatesWorkspace />}
      {activeWorkspace === "calendar" && <ContentCalendarWorkspace />}
      {activeWorkspace === "action-plan" && <ActionPlanWorkspace />}
      {activeWorkspace === "corrections" && <CorrectionsWorkspace />}
      {activeWorkspace === "make-delivery" && <MakeDeliveryWorkspace />}
    </main>
  </AppShell>;
}

export function HomePage({ repository }: { repository?: DashboardRepository } = {}) {
  return <DashboardDataProvider repository={repository}><HomePageContent /></DashboardDataProvider>;
}
