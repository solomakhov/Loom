import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Archive,
  CalendarDays,
  Check,
  CirclePause,
  Clock3,
  Edit3,
  FileText,
  Filter,
  ListChecks,
  LogOut,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { MaterialEditor } from "./MaterialEditor";
import { loadProjects, saveProjects } from "./storage";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  Project,
  ProjectDraft,
  ProjectMaterial,
  ProjectPriority,
  ProjectStatus,
  ProjectTask,
} from "./types";

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

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
const PASSWORD_RECOVERY_REQUESTED_KEY = "loom.passwordRecoveryRequested";

function getSaveStatusLabel(status: SaveStatus) {
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
    materials: [],
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

function getErrorMessage(error: unknown) {
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

function isRecoveryUrl() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    params.get("mode") === "recovery" ||
    params.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  );
}

function isPasswordRecoveryRequested() {
  return window.localStorage.getItem(PASSWORD_RECOVERY_REQUESTED_KEY) === "true";
}

function setPasswordRecoveryRequested() {
  window.localStorage.setItem(PASSWORD_RECOVERY_REQUESTED_KEY, "true");
}

function clearPasswordRecoveryRequested() {
  window.localStorage.removeItem(PASSWORD_RECOVERY_REQUESTED_KEY);
}

type AuthMode = "sign-in" | "sign-up" | "reset-password";

function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !email.trim() || (mode !== "reset-password" && !password)) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const { error } = await (async () => {
      if (mode === "reset-password") {
        return supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}?mode=recovery`,
        });
      }

      const credentials = {
        email: email.trim(),
        password,
      };

      return mode === "sign-in"
        ? supabase.auth.signInWithPassword(credentials)
        : supabase.auth.signUp(credentials);
    })();

    setIsSubmitting(false);

    if (error) {
      const errorMessage = getErrorMessage(error);
      setMessage(
        errorMessage ? `Не удалось выполнить действие: ${errorMessage}` : "Не удалось выполнить действие.",
      );
      return;
    }

    setMessage(
      mode === "reset-password"
        ? "Проверь почту и открой ссылку сброса пароля."
        : mode === "sign-in"
          ? "Вход выполнен."
          : "Аккаунт создан. Если Supabase требует подтверждение email, проверь почту.",
    );

    if (mode === "reset-password") {
      setPasswordRecoveryRequested();
    } else {
      clearPasswordRecoveryRequested();
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={handleAuth}>
        <p className="eyebrow">Loom</p>
        <h1>
          {mode === "reset-password"
            ? "Сброс пароля"
            : mode === "sign-in"
              ? "Вход"
              : "Регистрация"}
        </h1>
        <p>
          {mode === "reset-password"
            ? "Укажи email, и Supabase отправит ссылку для установки нового пароля."
            : mode === "sign-in"
              ? "Войди с email и паролем."
              : "Создай аккаунт с email и паролем."}
        </p>

        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {mode !== "reset-password" ? (
          <label>
            Пароль
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Минимум 6 символов"
            />
          </label>
        ) : null}

        <button className="text-button primary" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Проверяем..."
            : mode === "reset-password"
              ? "Отправить ссылку"
              : mode === "sign-in"
                ? "Войти"
                : "Создать аккаунт"}
        </button>

        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setMessage("");
          }}
        >
          {mode === "sign-in" ? "Создать аккаунт" : "Уже есть аккаунт"}
        </button>

        {mode !== "reset-password" ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setMode("reset-password");
              setPassword("");
              setMessage("");
            }}
          >
            Сбросить пароль
          </button>
        ) : null}

        {message ? <p className="auth-message">{message}</p> : null}
      </form>
    </main>
  );
}

type PasswordRecoveryPanelProps = {
  onComplete: () => void;
};

function PasswordRecoveryPanel({ onComplete }: PasswordRecoveryPanelProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !password) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);

    if (error) {
      const errorMessage = getErrorMessage(error);
      setMessage(
        errorMessage ? `Не удалось обновить пароль: ${errorMessage}` : "Не удалось обновить пароль.",
      );
      return;
    }

    setPassword("");
    setMessage("Пароль обновлен.");
    window.history.replaceState({}, document.title, window.location.origin);
    clearPasswordRecoveryRequested();
    onComplete();
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={handleUpdatePassword}>
        <p className="eyebrow">Loom</p>
        <h1>Новый пароль</h1>
        <p>Задай новый пароль для текущего аккаунта.</p>

        <label>
          Новый пароль
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Минимум 6 символов"
          />
        </label>

        <button className="text-button primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Сохраняем..." : "Сохранить пароль"}
        </button>

        {message ? <p className="auth-message">{message}</p> : null}
      </form>
    </main>
  );
}

export function App() {
  const saveTimerRef = useRef<number | null>(null);
  const latestProjectsRef = useRef<Project[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => isRecoveryUrl() || isPasswordRecoveryRequested(),
  );

  useEffect(() => {
    latestProjectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      if (data.session && (isRecoveryUrl() || isPasswordRecoveryRequested())) {
        setIsPasswordRecovery(true);
      }

      setSession(data.session);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryRequested();
        setIsPasswordRecovery(true);
      }

      if (event === "SIGNED_IN" && nextSession && isPasswordRecoveryRequested()) {
        setIsPasswordRecovery(true);
      }

      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured && !session) {
      setProjects([]);
      setSelectedId("");
      setSelectedMaterialId("");
      setIsLoadingProjects(false);
      return;
    }

    let isMounted = true;

    setIsLoadingProjects(true);

    loadProjects()
      .then((loadedProjects) => {
        if (!isMounted) {
          return;
        }

        setProjects(loadedProjects);
        setSelectedId((currentId) => currentId || loadedProjects[0]?.id || "");
        setStorageError("");
        setSaveStatus("saved");
      })
      .catch((error) => {
        console.error(error);

        if (isMounted) {
          setStorageError("Не удалось загрузить данные.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProjects(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const selectedProject = projects.find((project) => project.id === selectedId) ?? projects[0];
  const selectedMaterial =
    selectedProject?.materials.find((material) => material.id === selectedMaterialId) ??
    selectedProject?.materials[0];

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const searchable = [project.title, project.description, ...project.tags].join(" ").toLowerCase();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [projects, query, statusFilter]);

  async function persistProjects(nextProjects: Project[], previousProjects?: Project[]) {
    setSaveStatus("saving");

    try {
      await saveProjects(nextProjects);
      setStorageError("");
      setSaveStatus("saved");
    } catch (error) {
      console.error(error);
      const errorMessage = getErrorMessage(error);
      setStorageError(
        errorMessage ? `Не удалось сохранить данные: ${errorMessage}` : "Не удалось сохранить данные.",
      );
      setSaveStatus("error");

      if (previousProjects) {
        setProjects(previousProjects);
      }
    }
  }

  function commitProjects(nextProjects: Project[], options: { debounce?: boolean } = {}) {
    const previousProjects = latestProjectsRef.current;

    latestProjectsRef.current = nextProjects;
    setProjects(nextProjects);

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveStatus(options.debounce ? "pending" : "saving");

    if (options.debounce) {
      saveTimerRef.current = window.setTimeout(() => {
        persistProjects(latestProjectsRef.current);
      }, 800);
      return;
    }

    persistProjects(nextProjects, previousProjects);
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

  function updateProjectMaterials(
    projectId: string,
    nextMaterials: ProjectMaterial[],
    options: { debounce?: boolean } = {},
  ) {
    const now = new Date().toISOString();

    commitProjects(
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              materials: nextMaterials,
              updatedAt: now,
            }
          : project,
      ),
      options,
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
    if (!window.confirm(`Удалить проект "${project.title}"? Это действие нельзя отменить.`)) {
      return;
    }

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
    const task = project.tasks.find((item) => item.id === taskId);

    if (!window.confirm(`Удалить задачу "${task?.title ?? "Без названия"}"?`)) {
      return;
    }

    updateProjectTasks(
      project.id,
      project.tasks.filter((task) => task.id !== taskId),
    );
  }

  function addMaterial(project: Project) {
    const now = new Date().toISOString();
    const material: ProjectMaterial = {
      id: crypto.randomUUID(),
      title: `Материал ${project.materials.length + 1}`,
      markdown: "# Новый материал\n\nНачни писать здесь.",
      createdAt: now,
      updatedAt: now,
    };

    updateProjectMaterials(project.id, [...project.materials, material]);
    setSelectedMaterialId(material.id);
  }

  function updateMaterialMarkdown(project: Project, materialId: string, markdown: string) {
    const now = new Date().toISOString();
    const nextMaterials = project.materials.map((material) =>
      material.id === materialId ? { ...material, markdown, updatedAt: now } : material,
    );

    updateProjectMaterials(project.id, nextMaterials, { debounce: true });
  }

  function renameMaterial(project: Project, materialId: string, title: string) {
    const now = new Date().toISOString();
    const nextMaterials = project.materials.map((material) =>
      material.id === materialId ? { ...material, title, updatedAt: now } : material,
    );

    updateProjectMaterials(project.id, nextMaterials, { debounce: true });
  }

  function deleteMaterial(project: Project, materialId: string) {
    const material = project.materials.find((item) => item.id === materialId);

    if (!window.confirm(`Удалить материал "${material?.title ?? "Без названия"}"?`)) {
      return;
    }

    const nextMaterials = project.materials.filter((material) => material.id !== materialId);

    updateProjectMaterials(project.id, nextMaterials);
    setSelectedMaterialId(nextMaterials[0]?.id ?? "");
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    clearPasswordRecoveryRequested();
    setProjects([]);
    setSelectedId("");
    setSelectedMaterialId("");
    setSaveStatus("idle");
  }

  if (isAuthLoading) {
    return (
      <main className="auth-shell">
        <div className="auth-panel">
          <p className="eyebrow">Loom</p>
          <h1>Загружаем</h1>
          <p>Проверяем текущую сессию.</p>
        </div>
      </main>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <AuthPanel />;
  }

  if (isSupabaseConfigured && isPasswordRecovery) {
    return <PasswordRecoveryPanel onComplete={() => setIsPasswordRecovery(false)} />;
  }

  return (
    <main className="app-shell">
      <section className="sidebar" aria-label="Проекты">
        <div className="brand-row">
          <div>
            <p className="eyebrow">Loom</p>
            <h1>Проекты</h1>
          </div>
          <div className="sidebar-actions">
            {session ? (
              <button className="icon-button" type="button" onClick={signOut} title="Выйти">
                <LogOut size={17} />
              </button>
            ) : null}
            <button className="icon-button primary" type="button" onClick={openCreateForm} title="Создать проект">
              <Plus size={18} />
            </button>
          </div>
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
              onClick={() => {
                setSelectedId(project.id);
                setSelectedMaterialId("");
              }}
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
        <div className={`save-status ${saveStatus}`}>
          {getSaveStatusLabel(saveStatus)}
        </div>

        {storageError ? <div className="storage-banner">{storageError}</div> : null}

        {isLoadingProjects ? (
          <div className="empty-state">
            <h2>Загружаем проекты</h2>
            <p>Подключаемся к хранилищу и готовим рабочую область.</p>
          </div>
        ) : selectedProject ? (
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

            <section className="section-block materials-section">
              <div className="section-title-row">
                <div>
                  <h3>Материалы</h3>
                  <p>Markdown-документы проекта: заметки, планы, ссылки и черновики.</p>
                </div>
                <button
                  className="text-button primary"
                  type="button"
                  onClick={() => addMaterial(selectedProject)}
                >
                  <Plus size={16} />
                  Документ
                </button>
              </div>

              <div className="materials-layout">
                <div className="material-list" aria-label="Материалы проекта">
                  {selectedProject.materials.length ? (
                    selectedProject.materials.map((material) => (
                      <button
                        className={
                          selectedMaterial?.id === material.id ? "material-row selected" : "material-row"
                        }
                        key={material.id}
                        type="button"
                        onClick={() => setSelectedMaterialId(material.id)}
                      >
                        <FileText size={16} />
                        <span>{material.title}</span>
                      </button>
                    ))
                  ) : (
                    <p className="muted">Пока нет материалов.</p>
                  )}
                </div>

                <div className="material-editor-panel">
                  {selectedMaterial ? (
                    <>
                      <div className="material-title-row">
                        <input
                          value={selectedMaterial.title}
                          onChange={(event) =>
                            renameMaterial(selectedProject, selectedMaterial.id, event.target.value)
                          }
                          aria-label="Название материала"
                        />
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => deleteMaterial(selectedProject, selectedMaterial.id)}
                          title="Удалить материал"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <MaterialEditor
                        key={selectedMaterial.id}
                        markdown={selectedMaterial.markdown}
                        onChange={(markdown) =>
                          updateMaterialMarkdown(selectedProject, selectedMaterial.id, markdown)
                        }
                      />
                    </>
                  ) : (
                    <div className="material-empty">
                      <h3>Создай первый материал</h3>
                      <p>Он будет храниться как Markdown и останется связанным с проектом.</p>
                      <button
                        className="text-button primary"
                        type="button"
                        onClick={() => addMaterial(selectedProject)}
                      >
                        <Plus size={16} />
                        Новый документ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
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
