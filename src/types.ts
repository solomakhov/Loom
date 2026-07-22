export type ProjectStatus = "active" | "paused" | "done" | "archived";
export type ProjectPriority = "low" | "medium" | "high";

export type ProjectTask = {
  id: string;
  title: string;
  done: boolean;
  parentTaskId?: string;
  position?: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMaterial = {
  id: string;
  title: string;
  markdown: string;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
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
  materials: ProjectMaterial[];
  createdAt: string;
  updatedAt: string;
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
