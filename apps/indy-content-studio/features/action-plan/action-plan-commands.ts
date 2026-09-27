import type { ActionTask, DashboardState, StepStatus } from "../domain/types";
export function setProcessStepStatus(state: DashboardState, contentId: string, stepId: string, status: StepStatus, now: string): DashboardState { const content = state.contents.find((item) => item.id === contentId); if (!content) throw new Error("ไม่พบชิ้นงาน"); if (!content.processSteps.some((step) => step.id === stepId)) throw new Error("ไม่พบขั้นตอน"); return { ...state, contents: state.contents.map((item) => item.id === contentId ? { ...item, processSteps: item.processSteps.map((step) => step.id === stepId ? { ...step, status } : step), updatedAt: now } : item) }; }
export function rescheduleProcessStep(state: DashboardState, contentId: string, stepId: string, scheduledDate: string | null, now: string): DashboardState { return { ...state, contents: state.contents.map((item) => item.id === contentId ? { ...item, processSteps: item.processSteps.map((step) => step.id === stepId ? { ...step, scheduledDate } : step), updatedAt: now } : item) }; }

export function addStandaloneActionTask(state: DashboardState, input: { title: string; date: string; id: string; now: string }): DashboardState {
  const title = input.title.trim();
  if (!title) throw new Error("กรอกชื่องานก่อนเพิ่ม");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) throw new Error("วันที่ไม่ถูกต้อง");
  if ((state.actionTasks ?? []).some((task) => task.id === input.id)) throw new Error("งานนี้มีอยู่แล้ว");
  const task: ActionTask = { id: input.id, title, scheduledDate: input.date, status: "todo", createdAt: input.now, updatedAt: input.now };
  return { ...state, actionTasks: [...(state.actionTasks ?? []), task] };
}

export function setStandaloneActionTaskStatus(state: DashboardState, taskId: string, status: StepStatus, now: string): DashboardState {
  if (!(state.actionTasks ?? []).some((task) => task.id === taskId)) throw new Error("ไม่พบงาน Action Plan");
  return { ...state, actionTasks: state.actionTasks.map((task) => task.id === taskId ? { ...task, status, updatedAt: now } : task) };
}

export function rescheduleStandaloneActionTask(state: DashboardState, taskId: string, scheduledDate: string, now: string): DashboardState {
  if (!(state.actionTasks ?? []).some((task) => task.id === taskId)) throw new Error("ไม่พบงาน Action Plan");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || Number.isNaN(Date.parse(`${scheduledDate}T00:00:00Z`))) throw new Error("วันที่ไม่ถูกต้อง");
  return { ...state, actionTasks: state.actionTasks.map((task) => task.id === taskId ? { ...task, scheduledDate, updatedAt: now } : task) };
}
