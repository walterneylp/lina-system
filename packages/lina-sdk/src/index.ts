export type LinaTaskStatus = "pending" | "running" | "completed" | "failed";

export type LinaTask = {
  id: string;
  title: string;
  description?: string;
  status: LinaTaskStatus;
  assignedAgent?: string;
};
