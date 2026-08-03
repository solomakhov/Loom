import type { Project, ProjectMaterial, ProjectTask, WorkspaceData } from "./types";

export const WORKSPACE_BACKUP_FORMAT = "loom-workspace-backup";
export const WORKSPACE_BACKUP_VERSION = 1;
export const WORKSPACE_SCHEMA_VERSION = "202607300001";

export type WorkspaceBackup = {
  format: typeof WORKSPACE_BACKUP_FORMAT;
  formatVersion: typeof WORKSPACE_BACKUP_VERSION;
  schemaVersion: string;
  createdAt: string;
  storage: {
    filesIncluded: false;
  };
  workspace: WorkspaceData;
};

export type ParsedWorkspaceBackup = {
  backup: WorkspaceBackup;
  workspace: WorkspaceData;
  wasLegacy: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown) {
  return value === undefined || isString(value);
}

function isOptionalNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isTask(value: unknown): value is ProjectTask {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    typeof value.title === "string" &&
    typeof value.done === "boolean" &&
    isOptionalString(value.description) &&
    isOptionalString(value.parentTaskId) &&
    isOptionalNumber(value.position) &&
    isOptionalString(value.startDate) &&
    isOptionalString(value.dueDate) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isProject(value: unknown): value is Project {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.description) &&
    ["active", "paused", "done", "archived"].includes(String(value.status)) &&
    ["low", "medium", "high"].includes(String(value.priority)) &&
    isString(value.startDate) &&
    isString(value.dueDate) &&
    Array.isArray(value.tags) &&
    value.tags.every(isString) &&
    isString(value.icon) &&
    typeof value.progress === "number" &&
    Number.isFinite(value.progress) &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isTask) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isMaterial(value: unknown): value is ProjectMaterial {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.title) &&
    ["text", "pdf"].includes(String(value.kind)) &&
    isString(value.markdown) &&
    isOptionalString(value.filePath) &&
    isOptionalString(value.fileName) &&
    isOptionalString(value.mimeType) &&
    isOptionalNumber(value.fileSize) &&
    Array.isArray(value.links) &&
    value.links.every(
      (link) =>
        isRecord(link) &&
        isOptionalString(link.projectId) &&
        isOptionalString(link.taskId),
    ) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isWorkspace(value: unknown): value is WorkspaceData {
  return (
    isRecord(value) &&
    Array.isArray(value.projects) &&
    value.projects.every(isProject) &&
    Array.isArray(value.materials) &&
    value.materials.every(isMaterial)
  );
}

function resetWorkspaceRevisions(workspace: WorkspaceData): WorkspaceData {
  return {
    projects: workspace.projects.map((project) => ({
      ...project,
      revision: 0,
      tasks: project.tasks.map((task) => ({ ...task, revision: 0 })),
    })),
    materials: workspace.materials.map((material) => ({
      ...material,
      revision: 0,
      links: material.links.map((link) => ({ ...link })),
    })),
  };
}

export function createWorkspaceBackup(workspace: WorkspaceData): WorkspaceBackup {
  return {
    format: WORKSPACE_BACKUP_FORMAT,
    formatVersion: WORKSPACE_BACKUP_VERSION,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    storage: { filesIncluded: false },
    workspace,
  };
}

export function parseWorkspaceBackup(source: string): ParsedWorkspaceBackup {
  let value: unknown;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Файл не является корректным JSON.");
  }

  if (
    isRecord(value) &&
    value.format === WORKSPACE_BACKUP_FORMAT &&
    typeof value.formatVersion === "number"
  ) {
    if (value.formatVersion > WORKSPACE_BACKUP_VERSION) {
      throw new Error(
        `Копия создана в более новом формате (${value.formatVersion}). Обновите Loom перед восстановлением.`,
      );
    }

    if (value.formatVersion !== 1 || !isWorkspace(value.workspace)) {
      throw new Error("Структура резервной копии повреждена или не поддерживается.");
    }

    if (!isString(value.createdAt) || !isString(value.schemaVersion)) {
      throw new Error("В резервной копии отсутствуют сведения о версии или дате создания.");
    }

    const backup = value as WorkspaceBackup;
    return {
      backup,
      workspace: resetWorkspaceRevisions(backup.workspace),
      wasLegacy: false,
    };
  }

  const legacyWorkspace =
    isRecord(value) && isWorkspace(value.workspace) ? value.workspace : value;

  if (!isWorkspace(legacyWorkspace)) {
    throw new Error("Это не резервная копия рабочего пространства Loom.");
  }

  const workspace = resetWorkspaceRevisions(legacyWorkspace);
  return {
    backup: createWorkspaceBackup(workspace),
    workspace,
    wasLegacy: true,
  };
}

export function getWorkspaceBackupFileName(createdAt: string) {
  const timestamp = createdAt.replace(/[:.]/g, "-");
  return `loom-backup-${timestamp}.json`;
}
