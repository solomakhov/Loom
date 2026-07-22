import { supabase } from "./supabase";
import { Project, ProjectPriority, ProjectStatus, ProjectTask } from "./types";

const STORAGE_KEY = "loom.projects.v1";
const SUPABASE_PROJECTS_TABLE = "projects";
const EMPTY_PROJECT_ID = "__empty__";

type ProjectRow = {
  id: string;
  title: string | null;
  description: string | null;
  status: ProjectStatus | null;
  priority: ProjectPriority | null;
  start_date: string | null;
  due_date: string | null;
  icon: string | null;
  created_at: string | null;
  updated_at: string | null;
  data?: Project | null;
};

type ProjectTagRow = {
  project_id: string;
  tag: string;
};

type ProjectTaskRow = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

type MaterialRow = {
  id: string;
  title: string;
  markdown: string;
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

function emptyToNull(value: string) {
  return value.trim() || null;
}

const seedProjects: Project[] = [
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

function normalizeProject(project: Project): Project {
  const normalizedProject = {
    ...project,
    tasks: Array.isArray(project.tasks)
      ? project.tasks.map((task, index) => ({
          ...task,
          position: task.position ?? index,
        }))
      : [],
    materials: Array.isArray(project.materials) ? project.materials : [],
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
  materialRows: MaterialRow[],
  materialLinkRows: MaterialLinkRow[],
): Project {
  const projectMaterials = materialLinkRows
    .filter((link) => link.project_id === projectRow.id)
    .map((link) => materialRows.find((material) => material.id === link.material_id))
    .filter((material): material is MaterialRow => Boolean(material))
    .map((material) => ({
      id: material.id,
      title: material.title,
      markdown: material.markdown,
      createdAt: material.created_at,
      updatedAt: material.updated_at,
    }));

  const tasks: ProjectTask[] = taskRows
    .filter((task) => task.project_id === projectRow.id)
    .sort((a, b) => {
      const parentCompare = (a.parent_task_id ?? "").localeCompare(b.parent_task_id ?? "");
      return parentCompare || a.position - b.position;
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      done: task.done,
      parentTaskId: task.parent_task_id ?? undefined,
      position: task.position,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }));

  return normalizeProject({
    id: projectRow.id,
    title: projectRow.title ?? projectRow.data?.title ?? "Untitled project",
    description: projectRow.description ?? projectRow.data?.description ?? "",
    status: projectRow.status ?? projectRow.data?.status ?? "active",
    priority: projectRow.priority ?? projectRow.data?.priority ?? "medium",
    startDate: dateFromDb(projectRow.start_date) || projectRow.data?.startDate || "",
    dueDate: dateFromDb(projectRow.due_date) || projectRow.data?.dueDate || "",
    tags: tagRows
      .filter((tag) => tag.project_id === projectRow.id)
      .map((tag) => tag.tag),
    icon: projectRow.icon ?? projectRow.data?.icon ?? "L",
    progress: 0,
    tasks,
    materials: projectMaterials,
    createdAt: timestampFromDb(projectRow.created_at) || projectRow.data?.createdAt || new Date().toISOString(),
    updatedAt: timestampFromDb(projectRow.updated_at) || projectRow.data?.updatedAt || new Date().toISOString(),
  });
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

function loadProjectsFromLocalStorage(): Project[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    saveProjectsToLocalStorage(seedProjects);
    return seedProjects;
  }

  try {
    const projects = JSON.parse(raw);
    return Array.isArray(projects) ? projects.map(normalizeProject) : seedProjects;
  } catch {
    return seedProjects;
  }
}

function loadExistingProjectsFromLocalStorage(): Project[] | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const projects = JSON.parse(raw);
    return Array.isArray(projects) ? projects.map(normalizeProject) : null;
  } catch {
    return null;
  }
}

function saveProjectsToLocalStorage(projects: Project[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export async function loadProjects(): Promise<Project[]> {
  if (!supabase) {
    return loadProjectsFromLocalStorage();
  }

  const { data: projectRows, error: projectsError } = await supabase
    .from(SUPABASE_PROJECTS_TABLE)
    .select("id,title,description,status,priority,start_date,due_date,icon,created_at,updated_at,data")
    .order("updated_at", { ascending: false });

  if (projectsError) {
    throw projectsError;
  }

  const projects = (projectRows ?? []) as ProjectRow[];

  if (!projects.length) {
    const localProjects = loadExistingProjectsFromLocalStorage();

    if (localProjects?.length) {
      await saveProjects(localProjects);
      return localProjects;
    }

    return [];
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
      .select("id,project_id,parent_task_id,title,done,position,created_at,updated_at"),
    supabase.from("materials").select("id,title,markdown,created_at,updated_at"),
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

  loadedMaterialIds = new Set((materialRows ?? []).map((material) => material.id));
  loadedProjectIds = new Set(projects.map((project) => project.id));

  return projects.map((project) =>
    buildProjectFromRows(
      project,
      (tagRows ?? []) as ProjectTagRow[],
      (taskRows ?? []) as ProjectTaskRow[],
      (materialRows ?? []) as MaterialRow[],
      (materialLinkRows ?? []) as MaterialLinkRow[],
    ),
  );
}

export async function saveProjects(projects: Project[]) {
  saveProjectsToLocalStorage(projects);

  if (!supabase) {
    return;
  }

  const userId = await getCurrentUserId();
  const normalizedProjects = projects.map(normalizeProject);
  const projectRows = normalizedProjects.map((project) => ({
    id: project.id,
    user_id: userId,
    title: project.title.trim() || "Untitled project",
    description: project.description,
    status: project.status,
    priority: project.priority,
    start_date: emptyToNull(project.startDate),
    due_date: emptyToNull(project.dueDate),
    icon: project.icon,
    data: normalizeProject(project),
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

    await saveProjectChildren(normalizedProjects, userId);
    loadedProjectIds = currentProjectIds;
    return;
  }

  const currentMaterialIds = new Set<string>();
  await deleteLoadedMissingMaterials(currentMaterialIds);

  const { error } = await supabase
    .from(SUPABASE_PROJECTS_TABLE)
    .delete()
    .neq("id", EMPTY_PROJECT_ID);

  if (error) {
    throw error;
  }

  loadedProjectIds = new Set();
}

async function saveProjectChildren(projects: Project[], userId: string) {
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
        user_id: userId,
        project_id: project.id,
        parent_task_id: task.parentTaskId ?? null,
        title: task.title,
        done: task.done,
        position: task.position ?? index,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
      })),
    )
    .sort((a, b) => Number(Boolean(a.parent_task_id)) - Number(Boolean(b.parent_task_id)));

  const materialRows = uniqueById(
    projects.flatMap((project) =>
      project.materials.map((material) => ({
        id: material.id,
        user_id: userId,
        title: material.title,
        markdown: material.markdown,
        created_at: material.createdAt,
        updated_at: material.updatedAt,
      })),
    ),
  );

  const materialLinkRows = projects.flatMap((project) =>
    project.materials.map((material) => ({
      material_id: material.id,
      user_id: userId,
      project_id: project.id,
      task_id: null,
    })),
  );

  const currentMaterialIds = new Set(materialRows.map((material) => material.id));

  await deleteRowsForProjects("project_tags", projectIds);
  await deleteRowsForProjects("material_links", projectIds);

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
