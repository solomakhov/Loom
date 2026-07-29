import type {
  Project,
  ProjectDraft,
  ProjectPriority,
  ProjectStatus,
  ProjectTask,
} from "./types";

export const statusLabels: Record<ProjectStatus, string> = {
  active: "В работе",
  paused: "Пауза",
  done: "Готово",
  archived: "Архив",
};

export const priorityLabels: Record<ProjectPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

export const emptyDraft: ProjectDraft = {
  title: "",
  description: "",
  status: "active",
  priority: "medium",
  startDate: "",
  dueDate: "",
  tagsInput: "",
  icon: "L",
};

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
export type ProjectSection = "overview" | "tasks" | "materials";
export type MaterialScope = "task" | "project" | "all";

export type WorkspaceSearchResult = {
  id: string;
  kind: "project" | "task" | "material";
  title: string;
  context: string;
  projectId?: string;
  taskId?: string;
  materialId?: string;
};

export type TaskTreeItem = {
  task: ProjectTask;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
};

export function getSaveStatusLabel(status: SaveStatus) {
  switch (status) {
    case "pending":
      return "Есть несохраненные изменения";
    case "saving":
      return "Сохраняем...";
    case "saved":
      return "Сохранено";
    case "error":
      return "Ошибка сохранения";
    default:
      return "Сохранение не требуется";
  }
}

export function toDraft(project: Project): ProjectDraft {
  return {
    title: project.title,
    description: project.description,
    status: project.status,
    priority: project.priority,
    startDate: project.startDate,
    dueDate: project.dueDate,
    tagsInput: project.tags.join(", "),
    icon: project.icon,
  };
}

export function createProject(draft: ProjectDraft): Project {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    status: draft.status,
    priority: draft.priority,
    startDate: draft.startDate,
    dueDate: draft.dueDate,
    tags: parseTags(draft.tagsInput),
    icon: draft.icon.trim().slice(0, 2).toUpperCase() || "L",
    progress: 0,
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateProgress(tasks: ProjectTask[]) {
  if (!tasks.length) {
    return 0;
  }

  const completedCount = tasks.filter((task) => task.done).length;
  return Math.round((completedCount / tasks.length) * 100);
}

function getTaskParentKey(parentTaskId?: string) {
  return parentTaskId ?? "";
}

export function getTaskSiblings(tasks: ProjectTask[], parentTaskId?: string) {
  const parentKey = getTaskParentKey(parentTaskId);

  return tasks
    .filter((task) => getTaskParentKey(task.parentTaskId) === parentKey)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function normalizeTaskPositions(tasks: ProjectTask[]) {
  const normalizedTasks = tasks.map((task) => ({ ...task }));
  const parentKeys = new Set(normalizedTasks.map((task) => getTaskParentKey(task.parentTaskId)));

  parentKeys.forEach((parentKey) => {
    getTaskSiblings(normalizedTasks, parentKey || undefined).forEach((task, index) => {
      task.position = index;
    });
  });

  return normalizedTasks;
}

export function getTaskDescendantIds(tasks: ProjectTask[], taskId: string) {
  const ids = new Set([taskId]);
  let changed = true;

  while (changed) {
    changed = false;

    tasks.forEach((task) => {
      if (task.parentTaskId && ids.has(task.parentTaskId) && !ids.has(task.id)) {
        ids.add(task.id);
        changed = true;
      }
    });
  }

  return ids;
}

export function getTaskTreeItems(
  tasks: ProjectTask[],
  parentTaskId?: string,
  depth = 0,
): TaskTreeItem[] {
  const siblings = getTaskSiblings(tasks, parentTaskId);

  return siblings.flatMap((task, index) => [
    {
      task,
      depth,
      siblingIndex: index,
      siblingCount: siblings.length,
    },
    ...getTaskTreeItems(tasks, task.id, depth + 1),
  ]);
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export function formatDate(value: string) {
  if (!value) {
    return "Без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function isOverdue(project: Project) {
  if (!project.dueDate || project.status === "done" || project.status === "archived") {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${project.dueDate}T00:00:00`) < today;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function formatFileSize(value?: number) {
  if (!value) {
    return "";
  }

  if (value < 1024 * 1024) {
    return `${Math.ceil(value / 1024)} КБ`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}
