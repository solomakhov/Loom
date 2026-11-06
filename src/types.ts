export type ProjectStatus = "active" | "paused" | "done" | "archived";
export type ProjectPriority = "low" | "medium" | "high";

export type ProjectTask = {
  id: string;
  revision: number;
  title: string;
  description?: string;
  done: boolean;
  parentTaskId?: string;
  position?: number;
  startDate?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
};

export const TASK_DRAG_TYPE = "application/x-loom-task";

export type TaskDrag = {
  projectId: string;
  taskId: string;
  parentTaskId?: string;
};

export type TaskPlacement = "before" | "after" | "inside";

export type TaskDropTarget =
  | { projectId: string; taskId: string; placement: TaskPlacement }
  | { projectId: string; taskId?: never; placement?: never };

export type MaterialKind = "text" | "pdf";

export type MaterialLink = {
  projectId?: string;
  taskId?: string;
};

export type ProjectMaterial = {
  id: string;
  revision: number;
  title: string;
  kind: MaterialKind;
  markdown: string;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  links: MaterialLink[];
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  revision: number;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: string;
  dueDate: string;
  tags: string[];
  icon: string;
  progress: number;
  tasks: ProjectTask[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceData = {
  projects: Project[];
  materials: ProjectMaterial[];
};

export type ProjectDraft = {
  title: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: string;
  dueDate: string;
  tagsInput: string;
  icon: string;
};
