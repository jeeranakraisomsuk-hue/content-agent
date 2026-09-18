export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface DashboardTask {
  id: string;
  title: string;
  priority: TaskPriority;
  scheduledTime: string;
  workflowStage?: string;
  lastWorkedAt?: string;
  isComplete?: boolean;
}

const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Returns a new list so dashboard callers retain their original task order. */
export function sortTasksForToday(tasks: DashboardTask[]): DashboardTask[] {
  return [...tasks].sort((left, right) => {
    const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];

    return priorityDifference || left.scheduledTime.localeCompare(right.scheduledTime);
  });
}
