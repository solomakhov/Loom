import { FormEvent, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  CirclePause,
  Clock3,
  Edit3,
  Filter,
  ListChecks,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { loadProjects, saveProjects } from "./storage";
import { Project, ProjectDraft, ProjectPriority, ProjectStatus, ProjectTask } from "./types";

const statusLabels: Record<ProjectStatus, string> = {
  active: "В работе",
  paused: "Пауза",
  done: "Готово",
  archived: "Архив",
};

const priorityLabels: Record<ProjectPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

const emptyDraft: ProjectDraft = {
  title: "",
  description: "",
  status: "active",
  priority: "medium",
  startDate: "",
  dueDate: "",
  tagsInput: "",
  icon: "L",
};

function toDraft(project: Project): ProjectDraft {
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

function createProject(draft: ProjectDraft): Project {
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

function calculateProgress(tasks: ProjectTask[]) {
  if (!tasks.length) {
    return 0;
  }

  const completedCount = tasks.filter((task) => task.done).length;
  return Math.round((completedCount / tasks.length) * 100);
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function formatDate(value: string) {
  if (!value) {
    return "Без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function isOverdue(project: Project) {
  if (!project.dueDate || project.status === "done" || project.status === "archived") {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${project.dueDate}T00:00:00`) < today;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [selectedId, setSelectedId] = useState(() => projects[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const selectedProject = projects.find((project) => project.id === selectedId) ?? projects[0];

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const searchable = [project.title, project.description, ...project.tags].join(" ").toLowerCase();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [projects, query, statusFilter]);

  function commitProjects(nextProjects: Project[]) {
    setProjects(nextProjects);
    saveProjects(nextProjects);
  }

  function updateProjectTasks(projectId: string, nextTasks: ProjectTask[]) {
    const now = new Date().toISOString();

    commitProjects(
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              tasks: nextTasks,
              progress: calculateProgress(nextTasks),
              updatedAt: now,
            }
          : project,
      ),
    );
  }

  function openCreateForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setIsFormOpen(true);
  }

  function openEditForm(project: Project) {
    setEditingId(project.id);
    setDraft(toDraft(project));
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim()) {
      return;
    }

    if (editingId) {
      const now = new Date().toISOString();
      const nextProjects = projects.map((project) =>
        project.id === editingId
          ? {
              ...project,
              title: draft.title.trim(),
              description: draft.description.trim(),
              status: draft.status,
              priority: draft.priority,
              startDate: draft.startDate,
              dueDate: draft.dueDate,
              tags: parseTags(draft.tagsInput),
              icon: draft.icon.trim().slice(0, 2).toUpperCase() || "L",
              updatedAt: now,
            }
          : project,
      );
      commitProjects(nextProjects);
      setSelectedId(editingId);
    } else {
      const project = createProject(draft);
      commitProjects([project, ...projects]);
      setSelectedId(project.id);
    }

    closeForm();
  }

  function archiveProject(project: Project) {
    const now = new Date().toISOString();
    commitProjects(
      projects.map((item) =>
        item.id === project.id ? { ...item, status: "archived", updatedAt: now } : item,
      ),
    );
  }

  function deleteProject(project: Project) {
    const nextProjects = projects.filter((item) => item.id !== project.id);
    commitProjects(nextProjects);
    setSelectedId(nextProjects[0]?.id ?? "");
  }

  function addTask(project: Project) {
    const title = newTaskTitle.trim();

    if (!title) {
      return;
    }

    const now = new Date().toISOString();
    const task: ProjectTask = {
      id: crypto.randomUUID(),
      title,
      done: false,
      createdAt: now,
      updatedAt: now,
    };

    updateProjectTasks(project.id, [...project.tasks, task]);
    setNewTaskTitle("");
  }

  function toggleTask(project: Project, taskId: string) {
    const now = new Date().toISOString();
    const nextTasks = project.tasks.map((task) =>
      task.id === taskId ? { ...task, done: !task.done, updatedAt: now } : task,
    );

    updateProjectTasks(project.id, nextTasks);
  }

  function deleteTask(project: Project, taskId: string) {
    updateProjectTasks(
      project.id,
      project.tasks.filter((task) => task.id !== taskId),
    );
  }

  return (
    <main className="app-shell">
      <section className="sidebar" aria-label="Проекты">
        <div className="brand-row">
          <div>
            <p className="eyebrow">Loom</p>
            <h1>Проекты</h1>
          </div>
          <button className="icon-button primary" type="button" onClick={openCreateForm} title="Создать проект">
            <Plus size={18} />
          </button>
        </div>

        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти проект"
          />
        </label>

        <div className="filter-row" aria-label="Фильтр по статусу">
          <Filter size={15} />
          {(["all", "active", "paused", "done"] as const).map((status) => (
            <button
              key={status}
              className={statusFilter === status ? "filter-pill active" : "filter-pill"}
              type="button"
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? "Все" : statusLabels[status]}
            </button>
          ))}
        </div>

        <div className="project-list">
          {filteredProjects.map((project) => (
            <button
              key={project.id}
              className={selectedProject?.id === project.id ? "project-row selected" : "project-row"}
              type="button"
              onClick={() => setSelectedId(project.id)}
            >
              <span className="project-icon">{project.icon}</span>
              <span className="project-copy">
                <span className="project-title">{project.title}</span>
                <span className="project-meta">
                  <span className={`status-dot ${project.status}`} />
                  {statusLabels[project.status]}
                  {project.dueDate ? ` · ${formatDate(project.dueDate)}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="project-view" aria-label="Обзор проекта">
        {selectedProject ? (
          <>
            <header className="project-header">
              <div className="project-heading">
                <span className="project-mark">{selectedProject.icon}</span>
                <div>
                  <p className="eyebrow">Проект</p>
                  <h2>{selectedProject.title}</h2>
                </div>
              </div>
              <div className="action-row">
                <button className="text-button" type="button" onClick={() => openEditForm(selectedProject)}>
                  <Edit3 size={16} />
                  Редактировать
                </button>
                <button className="icon-button" type="button" onClick={() => archiveProject(selectedProject)} title="В архив">
                  <Archive size={17} />
                </button>
                <button className="icon-button danger" type="button" onClick={() => deleteProject(selectedProject)} title="Удалить">
                  <Trash2 size={17} />
                </button>
              </div>
            </header>

            <div className="overview-grid">
              <div className="metric">
                <span className={`metric-icon ${selectedProject.status}`}>
                  {selectedProject.status === "done" ? <Check size={17} /> : <CirclePause size={17} />}
                </span>
                <div>
                  <span className="label">Статус</span>
                  <strong>{statusLabels[selectedProject.status]}</strong>
                </div>
              </div>
              <div className="metric">
                <span className="metric-icon">
                  <Clock3 size={17} />
                </span>
                <div>
                  <span className="label">Приоритет</span>
                  <strong>{priorityLabels[selectedProject.priority]}</strong>
                </div>
              </div>
              <div className={isOverdue(selectedProject) ? "metric overdue" : "metric"}>
                <span className="metric-icon">
                  <CalendarDays size={17} />
                </span>
                <div>
                  <span className="label">Дедлайн</span>
                  <strong>{formatDate(selectedProject.dueDate)}</strong>
                </div>
              </div>
              <div className="metric">
                <span className="metric-icon">
                  <ListChecks size={17} />
                </span>
                <div>
                  <span className="label">Задачи</span>
                  <strong>{selectedProject.progress}%</strong>
                </div>
              </div>
            </div>

            <section className="section-block">
              <h3>Описание</h3>
              <p>{selectedProject.description || "Пока без описания."}</p>
            </section>

            <section className="section-block">
              <h3>Метки</h3>
              <div className="tag-row">
                {selectedProject.tags.length ? (
                  selectedProject.tags.map((tag) => <span key={tag}>#{tag}</span>)
                ) : (
                  <p>Метки не добавлены.</p>
                )}
              </div>
            </section>

            <section className="section-block tasks-section">
              <div className="section-title-row">
                <div>
                  <h3>Задачи</h3>
                  <p>
                    {selectedProject.tasks.filter((task) => task.done).length} из{" "}
                    {selectedProject.tasks.length} выполнено
                  </p>
                </div>
                <strong>{selectedProject.progress}%</strong>
              </div>

              <div className="progress-track" aria-label="Прогресс задач">
                <span style={{ width: `${selectedProject.progress}%` }} />
              </div>

              <form
                className="task-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  addTask(selectedProject);
                }}
              >
                <input
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="Добавить пункт плана"
                />
                <button className="icon-button primary" type="submit" title="Добавить задачу">
                  <Plus size={17} />
                </button>
              </form>

              <div className="task-list">
                {selectedProject.tasks.length ? (
                  selectedProject.tasks.map((task) => (
                    <div className={task.done ? "task-row done" : "task-row"} key={task.id}>
                      <label>
                        <input
                          checked={task.done}
                          type="checkbox"
                          onChange={() => toggleTask(selectedProject, task.id)}
                        />
                        <span>{task.title}</span>
                      </label>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => deleteTask(selectedProject, task.id)}
                        title="Удалить задачу"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">План пока пуст. Добавь первый конкретный шаг.</p>
                )}
              </div>
            </section>

            <div className="placeholder-grid">
              <div>
                <h3>Заметки</h3>
                <p>Заметки и ссылки будут привязаны к проекту.</p>
              </div>
              <div>
                <h3>Файлы</h3>
                <p>Файлы и документы подключим позже.</p>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h2>Создай первый проект</h2>
            <p>Начни с одной понятной сущности, а задачи и заметки добавим позже.</p>
            <button className="text-button primary" type="button" onClick={openCreateForm}>
              <Plus size={17} />
              Новый проект
            </button>
          </div>
        )}
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="project-form" onSubmit={handleSubmit}>
            <div className="form-header">
              <h2>{editingId ? "Редактировать проект" : "Новый проект"}</h2>
              <button className="icon-button" type="button" onClick={closeForm} title="Закрыть">
                <X size={18} />
              </button>
            </div>

            <label>
              Название
              <input
                required
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Например: Loom MVP"
              />
            </label>

            <label>
              Описание
              <textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="Цель, контекст, ссылки, важные ограничения"
              />
            </label>

            <div className="form-grid">
              <label>
                Статус
                <select
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectStatus })}
                >
                  <option value="active">В работе</option>
                  <option value="paused">Пауза</option>
                  <option value="done">Готово</option>
                  <option value="archived">Архив</option>
                </select>
              </label>

              <label>
                Приоритет
                <select
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value as ProjectPriority })}
                >
                  <option value="low">Низкий</option>
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                </select>
              </label>

              <label>
                Старт
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                />
              </label>

              <label>
                Дедлайн
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                />
              </label>
            </div>

            <div className="form-grid compact">
              <label>
                Метка проекта
                <input
                  maxLength={2}
                  value={draft.icon}
                  onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
                  placeholder="L"
                />
              </label>
              <label>
                Теги
                <input
                  value={draft.tagsInput}
                  onChange={(event) => setDraft({ ...draft, tagsInput: event.target.value })}
                  placeholder="разработка, дом, отпуск"
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="text-button" type="button" onClick={closeForm}>
                <X size={16} />
                Отмена
              </button>
              <button className="text-button primary" type="submit">
                <Save size={16} />
                Сохранить
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
