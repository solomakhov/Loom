import { Project } from "./types";

const STORAGE_KEY = "loom.projects.v1";

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
  };

  return {
    ...normalizedProject,
    progress: calculateProgress(normalizedProject),
  };
}

export function loadProjects(): Project[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    saveProjects(seedProjects);
    return seedProjects;
  }

  try {
    const projects = JSON.parse(raw);
    return Array.isArray(projects) ? projects.map(normalizeProject) : seedProjects;
  } catch {
    return seedProjects;
  }
}

export function saveProjects(projects: Project[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}
