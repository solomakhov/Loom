import { supabase } from "./supabase";
import { Project } from "./types";

const STORAGE_KEY = "loom.projects.v1";
const SUPABASE_PROJECTS_TABLE = "projects";
const EMPTY_PROJECT_ID = "__empty__";

type ProjectRow = {
  data: Project;
};

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
    tasks: Array.isArray(project.tasks) ? project.tasks : [],
    materials: Array.isArray(project.materials) ? project.materials : [],
  };

  return {
    ...normalizedProject,
    progress: calculateProgress(normalizedProject),
  };
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

  const { data, error } = await supabase
    .from(SUPABASE_PROJECTS_TABLE)
    .select("data")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ProjectRow[];

  if (!rows.length) {
    const localProjects = loadExistingProjectsFromLocalStorage();

    if (localProjects?.length) {
      await saveProjects(localProjects);
      return localProjects;
    }

    return [];
  }

  return rows.map((row) => normalizeProject(row.data));
}

export async function saveProjects(projects: Project[]) {
  saveProjectsToLocalStorage(projects);

  if (!supabase) {
    return;
  }

  const rows = projects.map((project) => ({
    id: project.id,
    title: project.title,
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

  if (rows.length) {
    const { error } = await supabase
      .from(SUPABASE_PROJECTS_TABLE)
      .upsert(rows, { onConflict: "id" });

    if (error) {
      throw error;
    }

    const ids = rows.map((row) => row.id).join(",");
    const { error: deleteError } = await supabase
      .from(SUPABASE_PROJECTS_TABLE)
      .delete()
      .not("id", "in", `(${ids})`);

    if (deleteError) {
      throw deleteError;
    }

    return;
  }

  const { error } = await supabase
    .from(SUPABASE_PROJECTS_TABLE)
    .delete()
    .neq("id", EMPTY_PROJECT_ID);

  if (error) {
    throw error;
  }
}
