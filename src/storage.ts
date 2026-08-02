import { supabase } from "./supabase";
import {
  MaterialLink,
  Project,
  ProjectMaterial,
  ProjectPriority,
  ProjectStatus,
  ProjectTask,
  WorkspaceData,
} from "./types";

const STORAGE_KEY = "loom.workspace.v2";
const LEGACY_STORAGE_KEY = "loom.projects.v1";
const SUPABASE_PROJECTS_TABLE = "projects";
const EMPTY_PROJECT_ID = "__empty__";
export const MATERIALS_BUCKET = "materials";

type ProjectRow = {
  id: string;
  revision: number;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  start_date: string | null;
  due_date: string | null;
  icon: string;
  created_at: string;
  updated_at: string;
};

type ProjectTagRow = {
  project_id: string;
  tag: string;
};

type ProjectTaskRow = {
  id: string;
  revision: number;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  done: boolean;
  position: number;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialRow = {
  id: string;
  revision: number;
  title: string;
  kind: "text" | "pdf";
  markdown: string;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

type MaterialLinkRow = {
  material_id: string;
  project_id: string | null;
  task_id: string | null;
};

let loadedMaterialIds = new Set<string>();
let loadedProjectIds = new Set<string>();

type LegacyMaterial = Omit<ProjectMaterial, "kind" | "links" | "revision"> & {
  revision?: number;
  taskId?: string;
};

type LegacyProject = Omit<Project, "revision" | "tasks"> & {
  revision?: number;
  tasks: Array<Omit<ProjectTask, "revision"> & { revision?: number }>;
  materials?: LegacyMaterial[];
};

type NormalizableProject = Omit<Project, "revision" | "tasks"> & {
  revision?: number;
  tasks: Array<Omit<ProjectTask, "revision"> & { revision?: number }>;
};

function emptyToNull(value: string) {
  return value.trim() || null;
}

const seedProjects: LegacyProject[] = [
  {
    id: "loom-mvp",
    title: "Loom MVP",
    description: "Первый прототип: личная доска проектов, CRUD, базовая модель проекта и задачи.",
    status: "active",
    priority: "high",
    startDate: "2026-07-16",
    dueDate: "",
    tags: ["разработка", "идея"],
    icon: "L",
    progress: 33,
    tasks: [
      {
        id: "task-project-crud",
        title: "Собрать CRUD проектов",
        done: true,
        createdAt: "2026-07-16T12:10:00.000Z",
        updatedAt: "2026-07-16T12:10:00.000Z",
      },
      {
        id: "task-project-tasks",
        title: "Добавить задачи внутри проекта",
        done: false,
        createdAt: "2026-07-16T12:15:00.000Z",
        updatedAt: "2026-07-16T12:15:00.000Z",
      },
      {
        id: "task-project-name",
        title: "Выбрать новое название и проверить домены",
        done: false,
        createdAt: "2026-07-16T12:20:00.000Z",
        updatedAt: "2026-07-16T12:20:00.000Z",
      },
    ],
    materials: [
      {
        id: "material-loom-notes",
        title: "Заметки по продукту",
        markdown:
          "# Loom MVP\n\n## Фокус\n\n- Проекты\n- Задачи\n- Markdown-материалы\n\n> Не строим Notion целиком. Собираем личный рабочий инструмент.",
        createdAt: "2026-07-16T12:45:00.000Z",
        updatedAt: "2026-07-16T12:45:00.000Z",
      },
    ],
    createdAt: "2026-07-16T12:00:00.000Z",
    updatedAt: "2026-07-16T12:00:00.000Z",
  },
  {
    id: "home-search",
    title: "Покупка дома",
    description: "Собрать критерии, варианты, документы и финансовую картину.",
    status: "paused",
    priority: "medium",
    startDate: "",
    dueDate: "",
    tags: ["дом", "финансы"],
    icon: "H",
    progress: 25,
    tasks: [
      {
        id: "task-home-criteria",
        title: "Сформулировать критерии дома",
        done: true,
        createdAt: "2026-07-16T12:25:00.000Z",
        updatedAt: "2026-07-16T12:25:00.000Z",
      },
      {
        id: "task-home-budget",
        title: "Оценить бюджет и ипотечные сценарии",
        done: false,
        createdAt: "2026-07-16T12:30:00.000Z",
        updatedAt: "2026-07-16T12:30:00.000Z",
      },
      {
        id: "task-home-shortlist",
        title: "Собрать короткий список вариантов",
        done: false,
        createdAt: "2026-07-16T12:35:00.000Z",
        updatedAt: "2026-07-16T12:35:00.000Z",
      },
      {
        id: "task-home-docs",
        title: "Подготовить список документов",
        done: false,
        createdAt: "2026-07-16T12:40:00.000Z",
        updatedAt: "2026-07-16T12:40:00.000Z",
      },
    ],
    materials: [
      {
        id: "material-home-criteria",
        title: "Критерии дома",
        markdown:
          "# Критерии дома\n\n## Обязательное\n\n- Тихое место\n- Нормальная дорога\n- Интернет\n\n## Проверить\n\n- Документы\n- Коммуникации\n- Соседи",
        createdAt: "2026-07-16T12:50:00.000Z",
        updatedAt: "2026-07-16T12:50:00.000Z",
      },
    ],
    createdAt: "2026-07-16T12:05:00.000Z",
    updatedAt: "2026-07-16T12:05:00.000Z",
  },
];

function calculateProgress(project: Project) {
  if (!project.tasks.length) {
    return 0;
  }

  const completedCount = project.tasks.filter((task) => task.done).length;
  return Math.round((completedCount / project.tasks.length) * 100);
}

function normalizeProject(project: NormalizableProject): Project {
  const normalizedProject = {
    ...project,
    revision: project.revision ?? 0,
    tasks: Array.isArray(project.tasks)
      ? project.tasks.map((task, index) => ({
          ...task,
          revision: task.revision ?? 0,
          description: task.description ?? "",
          position: task.position ?? index,
          startDate: task.startDate ?? "",
          dueDate: task.dueDate ?? "",
        }))
      : [],
  };

  return {
    ...normalizedProject,
    progress: calculateProgress(normalizedProject),
  };
}

function dateFromDb(value: string | null) {
  return value ?? "";
}

function timestampFromDb(value: string | null) {
  return value ?? new Date().toISOString();
}

function buildProjectFromRows(
  projectRow: ProjectRow,
  tagRows: ProjectTagRow[],
  taskRows: ProjectTaskRow[],
): Project {
  const tasks: ProjectTask[] = taskRows
    .filter((task) => task.project_id === projectRow.id)
    .sort((a, b) => {
      const parentCompare = (a.parent_task_id ?? "").localeCompare(b.parent_task_id ?? "");
      return parentCompare || a.position - b.position;
    })
    .map((task) => ({
      id: task.id,
      revision: task.revision,
      title: task.title,
      description: task.description ?? "",
      done: task.done,
      parentTaskId: task.parent_task_id ?? undefined,
      position: task.position,
      startDate: dateFromDb(task.start_date),
      dueDate: dateFromDb(task.due_date),
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }));

  return normalizeProject({
    id: projectRow.id,
    revision: projectRow.revision,
    title: projectRow.title,
    description: projectRow.description,
    status: projectRow.status,
    priority: projectRow.priority,
    startDate: dateFromDb(projectRow.start_date),
    dueDate: dateFromDb(projectRow.due_date),
    tags: tagRows
      .filter((tag) => tag.project_id === projectRow.id)
      .map((tag) => tag.tag),
    icon: projectRow.icon,
    progress: 0,
    tasks,
    createdAt: timestampFromDb(projectRow.created_at),
    updatedAt: timestampFromDb(projectRow.updated_at),
  });
}

function buildMaterialsFromRows(
  materialRows: MaterialRow[],
  materialLinkRows: MaterialLinkRow[],
): ProjectMaterial[] {
  return materialRows.map((material) => ({
    id: material.id,
    revision: material.revision,
    title: material.title,
    kind: material.kind ?? "text",
    markdown: material.markdown ?? "",
    filePath: material.file_path ?? undefined,
    fileName: material.file_name ?? undefined,
    mimeType: material.mime_type ?? undefined,
    fileSize: material.file_size ?? undefined,
    links: materialLinkRows
      .filter((link) => link.material_id === material.id)
      .map((link) => ({
        projectId: link.project_id ?? undefined,
        taskId: link.task_id ?? undefined,
      })),
    createdAt: material.created_at,
    updatedAt: material.updated_at,
  }));
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

async function getCurrentUserId() {
  if (!supabase) {
    return "";
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("No authenticated Supabase user.");
  }

  return user.id;
}

function migrateLegacyProjects(legacyProjects: LegacyProject[]): WorkspaceData {
  const materials = new Map<string, ProjectMaterial>();
  const projects = legacyProjects.map((legacyProject) => {
    const { materials: legacyMaterials = [], ...project } = legacyProject;

    legacyMaterials.forEach((legacyMaterial) => {
      const link: MaterialLink = legacyMaterial.taskId
        ? { taskId: legacyMaterial.taskId }
        : { projectId: project.id };
      const existingMaterial = materials.get(legacyMaterial.id);

      if (existingMaterial) {
        existingMaterial.links.push(link);
        return;
      }

      const { taskId: _taskId, ...material } = legacyMaterial;
      materials.set(legacyMaterial.id, {
        ...material,
        revision: legacyMaterial.revision ?? 0,
        kind: "text",
        links: [link],
      });
    });

    return normalizeProject(project);
  });

  return {
    projects,
    materials: Array.from(materials.values()),
  };
}

function normalizeWorkspace(workspace: WorkspaceData): WorkspaceData {
  return {
    projects: Array.isArray(workspace.projects) ? workspace.projects.map(normalizeProject) : [],
    materials: Array.isArray(workspace.materials)
      ? workspace.materials.map((material) => ({
          ...material,
          revision: material.revision ?? 0,
          kind: material.kind ?? "text",
          markdown: material.markdown ?? "",
          links: Array.isArray(material.links) ? material.links : [],
        }))
      : [],
  };
}

function loadWorkspaceFromLocalStorage(): WorkspaceData {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (raw) {
    try {
      return normalizeWorkspace(JSON.parse(raw) as WorkspaceData);
    } catch {
      // Try the legacy project-only format below.
    }
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);

  if (legacyRaw) {
    try {
      const legacyProjects = JSON.parse(legacyRaw);

      if (Array.isArray(legacyProjects)) {
        const workspace = migrateLegacyProjects(legacyProjects);
        saveWorkspaceToLocalStorage(workspace);
        return workspace;
      }
    } catch {
      // Fall back to the sample workspace.
    }
  }

  const workspace = migrateLegacyProjects(seedProjects);
  saveWorkspaceToLocalStorage(workspace);
  return workspace;
}

function loadExistingWorkspaceFromLocalStorage(): WorkspaceData | null {
  if (!window.localStorage.getItem(STORAGE_KEY) && !window.localStorage.getItem(LEGACY_STORAGE_KEY)) {
    return null;
  }

  return loadWorkspaceFromLocalStorage();
}

function saveWorkspaceToLocalStorage(workspace: WorkspaceData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export async function loadWorkspace(
  options: { importLocalIfEmpty?: boolean } = {},
): Promise<WorkspaceData> {
  if (!supabase) {
    return loadWorkspaceFromLocalStorage();
  }

  const { data: projectRows, error: projectsError } = await supabase
    .from(SUPABASE_PROJECTS_TABLE)
    .select("id,revision,title,description,status,priority,start_date,due_date,icon,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (projectsError) {
    throw projectsError;
  }

  const projects = (projectRows ?? []) as ProjectRow[];

  if (!projects.length && options.importLocalIfEmpty !== false) {
    const localWorkspace = loadExistingWorkspaceFromLocalStorage();

    if (localWorkspace?.projects.length || localWorkspace?.materials.length) {
      await saveWorkspace(localWorkspace);
      return localWorkspace;
    }
  }

  const [
    { data: tagRows, error: tagsError },
    { data: taskRows, error: tasksError },
    { data: materialRows, error: materialsError },
    { data: materialLinkRows, error: materialLinksError },
  ] = await Promise.all([
    supabase.from("project_tags").select("project_id,tag"),
    supabase
      .from("project_tasks")
      .select("id,revision,project_id,parent_task_id,title,description,done,position,start_date,due_date,created_at,updated_at"),
    supabase
      .from("materials")
      .select("id,revision,title,kind,markdown,file_path,file_name,mime_type,file_size,created_at,updated_at"),
    supabase.from("material_links").select("material_id,project_id,task_id"),
  ]);

  if (tagsError) {
    throw tagsError;
  }

  if (tasksError) {
    throw tasksError;
  }

  if (materialsError) {
    throw materialsError;
  }

  if (materialLinksError) {
    throw materialLinksError;
  }

  loadedProjectIds = new Set(projects.map((project) => project.id));

  loadedMaterialIds = new Set(((materialRows ?? []) as MaterialRow[]).map((material) => material.id));

  return {
    projects: projects.map((project) =>
      buildProjectFromRows(
        project,
        (tagRows ?? []) as ProjectTagRow[],
        (taskRows ?? []) as ProjectTaskRow[],
      ),
    ),
    materials: buildMaterialsFromRows(
      (materialRows ?? []) as MaterialRow[],
      (materialLinkRows ?? []) as MaterialLinkRow[],
    ),
  };
}

export async function saveWorkspace(workspace: WorkspaceData) {
  saveWorkspaceToLocalStorage(workspace);

  if (!supabase) {
    return;
  }

  const userId = await getCurrentUserId();
  const normalizedProjects = workspace.projects.map(normalizeProject);
  const normalizedMaterials = normalizeWorkspace(workspace).materials;
  const projectRows = normalizedProjects.map((project) => ({
    id: project.id,
    revision: Math.max(1, project.revision),
    user_id: userId,
    title: project.title.trim() || "Untitled project",
    description: project.description,
    status: project.status,
    priority: project.priority,
    start_date: emptyToNull(project.startDate),
    due_date: emptyToNull(project.dueDate),
    icon: project.icon,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }));

  if (projectRows.length) {
    const { error } = await supabase
      .from(SUPABASE_PROJECTS_TABLE)
      .upsert(projectRows, { onConflict: "id" });

    if (error) {
      throw error;
    }

    const currentProjectIds = new Set(projectRows.map((row) => row.id));
    const removedProjectIds = Array.from(loadedProjectIds).filter(
      (projectId) => !currentProjectIds.has(projectId),
    );

    if (removedProjectIds.length) {
      const { error: deleteError } = await supabase
        .from(SUPABASE_PROJECTS_TABLE)
        .delete()
        .in("id", removedProjectIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    await saveProjectChildren(normalizedProjects, normalizedMaterials, userId);
    loadedProjectIds = currentProjectIds;
    return;
  }

  await saveMaterials(normalizedMaterials, userId);

  const { error } = await supabase
    .from(SUPABASE_PROJECTS_TABLE)
    .delete()
    .neq("id", EMPTY_PROJECT_ID);

  if (error) {
    throw error;
  }

  loadedProjectIds = new Set();
}

async function saveProjectChildren(
  projects: Project[],
  materials: ProjectMaterial[],
  userId: string,
) {
  if (!supabase) {
    return;
  }

  const projectIds = projects.map((project) => project.id);

  if (!projectIds.length) {
    return;
  }

  const tagRows = projects.flatMap((project) =>
      project.tags.map((tag) => ({
        project_id: project.id,
        user_id: userId,
        tag,
      })),
  );

  const taskRows = projects
    .flatMap((project) =>
      project.tasks.map((task, index) => ({
        id: task.id,
        revision: Math.max(1, task.revision),
        user_id: userId,
        project_id: project.id,
        parent_task_id: task.parentTaskId ?? null,
        title: task.title,
        description: task.description ?? "",
        done: task.done,
        position: task.position ?? index,
        start_date: emptyToNull(task.startDate ?? ""),
        due_date: emptyToNull(task.dueDate ?? ""),
        created_at: task.createdAt,
        updated_at: task.updatedAt,
      })),
    )
    .sort((a, b) => Number(Boolean(a.parent_task_id)) - Number(Boolean(b.parent_task_id)));

  await deleteRowsForProjects("project_tags", projectIds);

  if (tagRows.length) {
    const { error } = await supabase.from("project_tags").insert(tagRows);

    if (error) {
      throw error;
    }
  }

  if (taskRows.length) {
    const { error } = await supabase
      .from("project_tasks")
      .upsert(taskRows, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  await deleteMissingRows("project_tasks", "id", taskRows.map((task) => task.id), projectIds);

  await saveMaterials(materials, userId);
}

async function saveMaterials(materials: ProjectMaterial[], userId: string) {
  if (!supabase) {
    return;
  }

  const materialRows = uniqueById(
    materials.map((material) => ({
      id: material.id,
      revision: Math.max(1, material.revision),
      user_id: userId,
      title: material.title,
      kind: material.kind,
      markdown: material.markdown,
      file_path: material.filePath ?? null,
      file_name: material.fileName ?? null,
      mime_type: material.mimeType ?? null,
      file_size: material.fileSize ?? null,
      created_at: material.createdAt,
      updated_at: material.updatedAt,
    })),
  );
  const materialLinkRows = materials.flatMap((material) =>
    material.links.map((link) => ({
      material_id: material.id,
      user_id: userId,
      project_id: link.projectId ?? null,
      task_id: link.taskId ?? null,
    })),
  );
  const currentMaterialIds = new Set(materialRows.map((material) => material.id));

  const { error: linkDeleteError } = await supabase
    .from("material_links")
    .delete()
    .neq("material_id", EMPTY_PROJECT_ID);

  if (linkDeleteError) {
    throw linkDeleteError;
  }

  if (materialRows.length) {
    const { error } = await supabase
      .from("materials")
      .upsert(materialRows, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  if (materialLinkRows.length) {
    const { error } = await supabase.from("material_links").insert(materialLinkRows);

    if (error) {
      throw error;
    }
  }

  await deleteLoadedMissingMaterials(currentMaterialIds);
  loadedMaterialIds = currentMaterialIds;
}

async function deleteRowsForProjects(tableName: string, projectIds: string[]) {
  if (!supabase || !projectIds.length) {
    return;
  }

  const { error } = await supabase.from(tableName).delete().in("project_id", projectIds);

  if (error) {
    throw error;
  }
}

async function deleteMissingRows(
  tableName: string,
  idColumn: string,
  currentIds: string[],
  projectIds: string[],
) {
  if (!supabase || !projectIds.length) {
    return;
  }

  const { data, error: selectError } = await supabase
    .from(tableName)
    .select(idColumn)
    .in("project_id", projectIds);

  if (selectError) {
    throw selectError;
  }

  const rows = (data ?? []) as unknown as Record<string, string>[];
  const currentIdSet = new Set(currentIds);
  const removedIds = rows
    .map((row) => row[idColumn])
    .filter((id) => id && !currentIdSet.has(id));

  if (!removedIds.length) {
    return;
  }

  const { error } = await supabase.from(tableName).delete().in(idColumn, removedIds);

  if (error) {
    throw error;
  }
}

async function deleteLoadedMissingMaterials(currentMaterialIds: Set<string>) {
  if (!supabase || !loadedMaterialIds.size) {
    return;
  }

  const removedMaterialIds = Array.from(loadedMaterialIds).filter(
    (materialId) => !currentMaterialIds.has(materialId),
  );

  if (!removedMaterialIds.length) {
    return;
  }

  const { error } = await supabase.from("materials").delete().in("id", removedMaterialIds);

  if (error) {
    throw error;
  }
}

export type WorkspaceEntityKind = "project" | "task" | "material";

export class WorkspaceConflictError extends Error {
  constructor(
    public readonly entityKind: WorkspaceEntityKind,
    public readonly entityId: string,
  ) {
    super("Данные изменились в другом окне.");
    this.name = "WorkspaceConflictError";
  }
}

export type WorkspaceRealtimeChange = {
  table: "projects" | "project_tasks" | "materials" | "project_tags" | "material_links";
  eventType: "INSERT" | "UPDATE" | "DELETE";
  entityId?: string;
  revision?: number;
};

function comparableEntity<T extends { revision: number }>(entity: T) {
  const { revision: _revision, ...value } = entity;
  return JSON.stringify(value);
}

function entitiesDiffer<T extends { revision: number }>(left: T, right: T) {
  return comparableEntity(left) !== comparableEntity(right);
}

function projectsDiffer(left: Project, right: Project) {
  const {
    revision: _leftRevision,
    tasks: _leftTasks,
    progress: _leftProgress,
    updatedAt: _leftUpdatedAt,
    ...leftValue
  } = left;
  const {
    revision: _rightRevision,
    tasks: _rightTasks,
    progress: _rightProgress,
    updatedAt: _rightUpdatedAt,
    ...rightValue
  } = right;
  return JSON.stringify(leftValue) !== JSON.stringify(rightValue);
}

function flattenTasks(workspace: WorkspaceData) {
  return workspace.projects.flatMap((project) =>
    project.tasks.map((task) => ({ projectId: project.id, task })),
  );
}

async function replaceProjectTags(project: Project, userId: string) {
  if (!supabase) {
    return;
  }

  const { error: deleteError } = await supabase
    .from("project_tags")
    .delete()
    .eq("project_id", project.id);

  if (deleteError) {
    throw deleteError;
  }

  if (!project.tags.length) {
    return;
  }

  const { error } = await supabase.from("project_tags").insert(
    project.tags.map((tag) => ({
      project_id: project.id,
      user_id: userId,
      tag,
    })),
  );

  if (error) {
    throw error;
  }
}

async function replaceMaterialLinks(material: ProjectMaterial, userId: string) {
  if (!supabase) {
    return;
  }

  const { error: deleteError } = await supabase
    .from("material_links")
    .delete()
    .eq("material_id", material.id);

  if (deleteError) {
    throw deleteError;
  }

  if (!material.links.length) {
    return;
  }

  const { error } = await supabase.from("material_links").insert(
    material.links.map((link) => ({
      material_id: material.id,
      user_id: userId,
      project_id: link.projectId ?? null,
      task_id: link.taskId ?? null,
    })),
  );

  if (error) {
    throw error;
  }
}

async function saveProjectEntity(project: Project, userId: string) {
  if (!supabase) {
    return project.revision + 1;
  }

  const row = {
    user_id: userId,
    title: project.title.trim() || "Untitled project",
    description: project.description,
    status: project.status,
    priority: project.priority,
    start_date: emptyToNull(project.startDate),
    due_date: emptyToNull(project.dueDate),
    icon: project.icon,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };

  if (project.revision <= 0) {
    const { data, error } = await supabase
      .from("projects")
      .insert({ id: project.id, revision: 1, ...row })
      .select("revision")
      .single();

    if (error) {
      throw error.code === "23505"
        ? new WorkspaceConflictError("project", project.id)
        : error;
    }

    await replaceProjectTags(project, userId);
    return Number(data.revision);
  }

  const nextRevision = project.revision + 1;
  const { data, error } = await supabase
    .from("projects")
    .update({ ...row, revision: nextRevision })
    .eq("id", project.id)
    .eq("revision", project.revision)
    .select("revision")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new WorkspaceConflictError("project", project.id);
  }

  await replaceProjectTags(project, userId);
  return Number(data.revision);
}

async function saveTaskEntity(projectId: string, task: ProjectTask, userId: string) {
  if (!supabase) {
    return task.revision + 1;
  }

  const row = {
    user_id: userId,
    project_id: projectId,
    parent_task_id: task.parentTaskId ?? null,
    title: task.title,
    description: task.description ?? "",
    done: task.done,
    position: task.position ?? 0,
    start_date: emptyToNull(task.startDate ?? ""),
    due_date: emptyToNull(task.dueDate ?? ""),
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };

  if (task.revision <= 0) {
    const { data, error } = await supabase
      .from("project_tasks")
      .insert({ id: task.id, revision: 1, ...row })
      .select("revision")
      .single();

    if (error) {
      throw error.code === "23505"
        ? new WorkspaceConflictError("task", task.id)
        : error;
    }

    return Number(data.revision);
  }

  const nextRevision = task.revision + 1;
  const { data, error } = await supabase
    .from("project_tasks")
    .update({ ...row, revision: nextRevision })
    .eq("id", task.id)
    .eq("revision", task.revision)
    .select("revision")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new WorkspaceConflictError("task", task.id);
  }

  return Number(data.revision);
}

async function saveMaterialEntity(material: ProjectMaterial, userId: string) {
  if (!supabase) {
    return material.revision + 1;
  }

  const row = {
    user_id: userId,
    title: material.title,
    kind: material.kind,
    markdown: material.markdown,
    file_path: material.filePath ?? null,
    file_name: material.fileName ?? null,
    mime_type: material.mimeType ?? null,
    file_size: material.fileSize ?? null,
    created_at: material.createdAt,
    updated_at: material.updatedAt,
  };

  if (material.revision <= 0) {
    const { data, error } = await supabase
      .from("materials")
      .insert({ id: material.id, revision: 1, ...row })
      .select("revision")
      .single();

    if (error) {
      throw error.code === "23505"
        ? new WorkspaceConflictError("material", material.id)
        : error;
    }

    await replaceMaterialLinks(material, userId);
    return Number(data.revision);
  }

  const nextRevision = material.revision + 1;
  const { data, error } = await supabase
    .from("materials")
    .update({ ...row, revision: nextRevision })
    .eq("id", material.id)
    .eq("revision", material.revision)
    .select("revision")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new WorkspaceConflictError("material", material.id);
  }

  await replaceMaterialLinks(material, userId);
  return Number(data.revision);
}

async function deleteEntity(
  table: string,
  kind: WorkspaceEntityKind,
  id: string,
  revision: number,
) {
  if (!supabase) {
    return;
  }

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("revision", revision)
    .select("id");

  if (error) {
    throw error;
  }

  if (!data?.length) {
    throw new WorkspaceConflictError(kind, id);
  }
}

export async function saveWorkspaceChanges(
  previousWorkspace: WorkspaceData,
  nextWorkspace: WorkspaceData,
): Promise<WorkspaceData> {
  const previous = normalizeWorkspace(previousWorkspace);
  const next = normalizeWorkspace(nextWorkspace);
  const projectRevisions = new Map<string, number>();
  const taskRevisions = new Map<string, number>();
  const materialRevisions = new Map<string, number>();
  const previousProjects = new Map(previous.projects.map((project) => [project.id, project]));
  const nextProjects = new Map(next.projects.map((project) => [project.id, project]));
  const previousTasks = new Map(flattenTasks(previous).map((item) => [item.task.id, item]));
  const nextTasks = new Map(flattenTasks(next).map((item) => [item.task.id, item]));
  const previousMaterials = new Map(previous.materials.map((material) => [material.id, material]));
  const nextMaterials = new Map(next.materials.map((material) => [material.id, material]));
  const userId = await getCurrentUserId();
  const getTaskDepth = (taskId: string) => {
    let depth = 0;
    let parentId = previousTasks.get(taskId)?.task.parentTaskId;

    while (parentId) {
      depth += 1;
      parentId = previousTasks.get(parentId)?.task.parentTaskId;
    }

    return depth;
  };

  for (const project of next.projects) {
    const oldProject = previousProjects.get(project.id);

    if (!oldProject || projectsDiffer(oldProject, project)) {
      projectRevisions.set(
        project.id,
        await saveProjectEntity(
          { ...project, revision: oldProject?.revision ?? project.revision },
          userId,
        ),
      );
    }
  }

  const removedTasks = Array.from(previousTasks.entries())
    .filter(([taskId]) => !nextTasks.has(taskId))
    .sort(([leftId], [rightId]) => getTaskDepth(rightId) - getTaskDepth(leftId));

  for (const [taskId, item] of removedTasks) {
    await deleteEntity("project_tasks", "task", taskId, item.task.revision);
  }

  const changedTasks = Array.from(nextTasks.values())
    .filter(({ task }) => {
      const oldTask = previousTasks.get(task.id)?.task;
      return !oldTask || entitiesDiffer(oldTask, task);
    })
    .sort(
      (left, right) =>
        Number(Boolean(left.task.parentTaskId)) - Number(Boolean(right.task.parentTaskId)),
    );

  for (const { projectId, task } of changedTasks) {
    taskRevisions.set(
      task.id,
      await saveTaskEntity(
        projectId,
        {
          ...task,
          revision: previousTasks.get(task.id)?.task.revision ?? task.revision,
        },
        userId,
      ),
    );
  }

  for (const material of next.materials) {
    const oldMaterial = previousMaterials.get(material.id);

    if (!oldMaterial || entitiesDiffer(oldMaterial, material)) {
      materialRevisions.set(
        material.id,
        await saveMaterialEntity(
          { ...material, revision: oldMaterial?.revision ?? material.revision },
          userId,
        ),
      );
    }
  }

  for (const [materialId, material] of previousMaterials) {
    if (!nextMaterials.has(materialId)) {
      await deleteEntity("materials", "material", materialId, material.revision);
    }
  }

  for (const [projectId, project] of previousProjects) {
    if (!nextProjects.has(projectId)) {
      await deleteEntity("projects", "project", projectId, project.revision);
    }
  }

  const savedWorkspace: WorkspaceData = {
    projects: next.projects.map((project) => ({
      ...project,
      revision:
        projectRevisions.get(project.id) ??
        previousProjects.get(project.id)?.revision ??
        project.revision,
      tasks: project.tasks.map((task) => ({
        ...task,
        revision:
          taskRevisions.get(task.id) ??
          previousTasks.get(task.id)?.task.revision ??
          task.revision,
      })),
    })),
    materials: next.materials.map((material) => ({
      ...material,
      revision:
        materialRevisions.get(material.id) ??
        previousMaterials.get(material.id)?.revision ??
        material.revision,
    })),
  };

  saveWorkspaceToLocalStorage(savedWorkspace);
  return savedWorkspace;
}

export function subscribeToWorkspaceChanges(
  onChange: (change: WorkspaceRealtimeChange) => void,
) {
  if (!supabase) {
    return () => undefined;
  }

  const client = supabase;
  const notify = (
    table: WorkspaceRealtimeChange["table"],
    payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    },
  ) => {
    const row = payload.eventType === "DELETE" ? payload.old : payload.new;
    const revision = Number(row.revision);

    onChange({
      table,
      eventType: payload.eventType,
      entityId: typeof row.id === "string" ? row.id : undefined,
      revision: Number.isFinite(revision) ? revision : undefined,
    });
  };
  const channel = client
    .channel(`workspace:${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "projects" },
      (payload) => notify("projects", payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "project_tasks" },
      (payload) => notify("project_tasks", payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "materials" },
      (payload) => notify("materials", payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "project_tags" },
      (payload) => notify("project_tags", payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "material_links" },
      (payload) => notify("material_links", payload),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function uploadPdfFile(materialId: string, file: File) {
  if (!supabase) {
    throw new Error("Для загрузки PDF требуется подключение к Supabase.");
  }

  const userId = await getCurrentUserId();
  const filePath = `${userId}/${materialId}.pdf`;
  const { error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .upload(filePath, file, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return filePath;
}

export async function getMaterialFileUrl(filePath: string) {
  if (!supabase) {
    return "";
  }

  const { data, error } = await supabase.storage
    .from(MATERIALS_BUCKET)
    .createSignedUrl(filePath, 60 * 60);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

export async function deleteMaterialFile(filePath: string) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.storage.from(MATERIALS_BUCKET).remove([filePath]);

  if (error) {
    throw error;
  }
}
