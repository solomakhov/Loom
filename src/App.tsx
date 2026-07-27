import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePause,
  Clock3,
  Download,
  Edit3,
  FileUp,
  FileText,
  Filter,
  Link2,
  ListChecks,
  LogOut,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { MaterialEditor } from "./MaterialEditor";
import {
  deleteMaterialFile,
  getMaterialFileUrl,
  loadWorkspace,
  saveWorkspace,
  uploadPdfFile,
} from "./storage";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  MaterialLink,
  Project,
  ProjectDraft,
  ProjectMaterial,
  ProjectPriority,
  ProjectStatus,
  ProjectTask,
  WorkspaceData,
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
type ProjectSection = "overview" | "tasks" | "materials";
type WorkspaceSearchResult = {
  id: string;
  kind: "project" | "task" | "material";
  title: string;
  context: string;
  projectId?: string;
  taskId?: string;
  materialId?: string;
};
const PASSWORD_RECOVERY_REQUESTED_KEY = "loom.passwordRecoveryRequested";
const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, "");

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

function getTaskParentKey(parentTaskId?: string) {
  return parentTaskId ?? "";
}

function getTaskSiblings(tasks: ProjectTask[], parentTaskId?: string) {
  const parentKey = getTaskParentKey(parentTaskId);

  return tasks
    .filter((task) => getTaskParentKey(task.parentTaskId) === parentKey)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function normalizeTaskPositions(tasks: ProjectTask[]) {
  const normalizedTasks = tasks.map((task) => ({ ...task }));
  const parentKeys = new Set(normalizedTasks.map((task) => getTaskParentKey(task.parentTaskId)));

  parentKeys.forEach((parentKey) => {
    getTaskSiblings(normalizedTasks, parentKey || undefined).forEach((task, index) => {
      task.position = index;
    });
  });

  return normalizedTasks;
}

function getTaskDescendantIds(tasks: ProjectTask[], taskId: string) {
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

type TaskTreeItem = {
  task: ProjectTask;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
};

function getTaskTreeItems(tasks: ProjectTask[], parentTaskId?: string, depth = 0): TaskTreeItem[] {
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

function getRecoveryCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}

function getHashSessionTokens() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
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

function getPasswordRecoveryRedirectUrl() {
  return `${appUrl}/?mode=recovery`;
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
          redirectTo: getPasswordRecoveryRedirectUrl(),
        });
      }

      clearPasswordRecoveryRequested();

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

function formatFileSize(value?: number) {
  if (!value) {
    return "";
  }

  if (value < 1024 * 1024) {
    return `${Math.ceil(value / 1024)} КБ`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

function PdfMaterialViewer({ material }: { material: ProjectMaterial }) {
  const [fileUrl, setFileUrl] = useState("");
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (!material.filePath) {
      setFileError("У PDF не указан путь к файлу.");
      return;
    }

    setFileUrl("");
    setFileError("");
    getMaterialFileUrl(material.filePath)
      .then((url) => {
        if (isMounted) {
          setFileUrl(url);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setFileError(`Не удалось открыть PDF: ${getErrorMessage(error)}`);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [material.filePath]);

  return (
    <div className="pdf-material">
      <div className="pdf-material-meta">
        <span>{material.fileName || "PDF-документ"}</span>
        <span>{formatFileSize(material.fileSize)}</span>
        {fileUrl ? (
          <a className="text-button" href={fileUrl} target="_blank" rel="noreferrer">
            <Download size={15} />
            Скачать
          </a>
        ) : null}
      </div>
      {fileError ? <p className="material-file-error">{fileError}</p> : null}
      {!fileError && !fileUrl ? <p className="muted">Открываем PDF...</p> : null}
      {fileUrl ? (
        <iframe
          className="pdf-frame"
          src={fileUrl}
          title={material.title.trim() || material.fileName || "PDF"}
        />
      ) : null}
    </div>
  );
}

export function App() {
  const saveTimerRef = useRef<number | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const pendingMaterialNavigationRef = useRef<{ id: string; scope: "context" | "all" } | null>(
    null,
  );
  const latestWorkspaceRef = useRef<WorkspaceData>({ projects: [], materials: [] });
  const [projects, setProjects] = useState<Project[]>([]);
  const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [projectSection, setProjectSection] = useState<ProjectSection>("tasks");
  const [materialScope, setMaterialScope] = useState<"context" | "all">("context");
  const [linkingMaterialId, setLinkingMaterialId] = useState("");
  const [expandedMaterialLinkProjectIds, setExpandedMaterialLinkProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => isRecoveryUrl());

  useEffect(() => {
    latestWorkspaceRef.current = { projects, materials };
  }, [projects, materials]);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    const client = supabase;
    let isMounted = true;

    async function initializeAuth() {
      try {
        if (isRecoveryUrl()) {
          setPasswordRecoveryRequested();
          setIsPasswordRecovery(true);
        }

        const recoveryCode = getRecoveryCode();
        const hashSessionTokens = getHashSessionTokens();

        if (recoveryCode) {
          const { data, error } = await client.auth.exchangeCodeForSession(recoveryCode);

          if (error) {
            console.error(error);
          }

          if (!isMounted) {
            return;
          }

          if (data.session) {
            setPasswordRecoveryRequested();
            setIsPasswordRecovery(true);
            setSession(data.session);
            window.history.replaceState({}, document.title, getPasswordRecoveryRedirectUrl());
            return;
          }
        }

        if (hashSessionTokens) {
          const { data, error } = await client.auth.setSession(hashSessionTokens);

          if (error) {
            console.error(error);
          }

          if (!isMounted) {
            return;
          }

          if (data.session) {
            setPasswordRecoveryRequested();
            setIsPasswordRecovery(true);
            setSession(data.session);
            window.history.replaceState({}, document.title, getPasswordRecoveryRedirectUrl());
            return;
          }
        }

        const { data } = await client.auth.getSession();

        if (!isMounted) {
          return;
        }

        if (data.session && (isRecoveryUrl() || isPasswordRecoveryRequested())) {
          setIsPasswordRecovery(true);
        }

        setSession(data.session);
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }

    initializeAuth();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
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
      latestWorkspaceRef.current = { projects: [], materials: [] };
      setProjects([]);
      setMaterials([]);
      setSelectedId("");
      setSelectedMaterialId("");
      setSelectedTaskId("");
      setIsLoadingProjects(false);
      return;
    }

    let isMounted = true;

    setIsLoadingProjects(true);

    loadWorkspace()
      .then((loadedWorkspace) => {
        if (!isMounted) {
          return;
        }

        latestWorkspaceRef.current = loadedWorkspace;
        setProjects(loadedWorkspace.projects);
        setMaterials(loadedWorkspace.materials);
        setSelectedId((currentId) => currentId || loadedWorkspace.projects[0]?.id || "");
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
  const selectedTaskItems = selectedProject ? getTaskTreeItems(selectedProject.tasks) : [];
  const selectedTask = selectedProject?.tasks.find((task) => task.id === selectedTaskId);
  const selectedTaskSubtasks = selectedProject && selectedTask
    ? getTaskSiblings(selectedProject.tasks, selectedTask.id)
    : [];
  const selectedTaskMaterials = selectedTask
    ? materials.filter((material) => material.links.some((link) => link.taskId === selectedTask.id))
    : [];
  const contextualMaterials = materialScope === "all"
    ? materials
    : selectedTask
      ? selectedTaskMaterials
      : selectedProject
        ? materials.filter((material) =>
            material.links.some((link) => link.projectId === selectedProject.id),
          )
        : [];
  const selectedMaterial =
    contextualMaterials.find((material) => material.id === selectedMaterialId) ??
    contextualMaterials[0];
  const linkingMaterial = materials.find((material) => material.id === linkingMaterialId);

  useEffect(() => {
    if (!selectedProject || !selectedTaskId) {
      return;
    }

    if (!selectedProject.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId("");
    }
  }, [selectedProject, selectedTaskId]);

  useEffect(() => {
    const pendingMaterialNavigation = pendingMaterialNavigationRef.current;

    if (pendingMaterialNavigation) {
      pendingMaterialNavigationRef.current = null;
      setMaterialScope(pendingMaterialNavigation.scope);
      setSelectedMaterialId(pendingMaterialNavigation.id);
      return;
    }

    setMaterialScope("context");
    setSelectedMaterialId("");
  }, [selectedId, selectedTaskId]);

  const filteredProjects = useMemo(() => {
    return projects.filter(
      (project) => statusFilter === "all" || project.status === statusFilter,
    );
  }, [projects, statusFilter]);

  const searchResults = useMemo<WorkspaceSearchResult[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");

    if (!normalizedQuery) {
      return [];
    }

    const matches = (values: Array<string | undefined>) =>
      values
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(normalizedQuery);

    const projectResults = projects
      .filter((project) =>
        matches([project.title, project.description, ...project.tags]),
      )
      .map<WorkspaceSearchResult>((project) => ({
        id: `project:${project.id}`,
        kind: "project",
        title: project.title,
        context: `Проект · ${statusLabels[project.status]}`,
        projectId: project.id,
      }));

    const taskResults = projects.flatMap((project) =>
      project.tasks
        .filter((task) => matches([task.title, task.description]))
        .map<WorkspaceSearchResult>((task) => ({
          id: `task:${task.id}`,
          kind: "task",
          title: task.title,
          context: `Задача · ${project.title}`,
          projectId: project.id,
          taskId: task.id,
        })),
    );

    const materialResults = materials
      .filter((material) =>
        matches([material.title, material.fileName, material.markdown]),
      )
      .map<WorkspaceSearchResult>((material) => {
        const linkedTaskId = material.links.find((link) => link.taskId)?.taskId;
        const linkedTaskProject = linkedTaskId
          ? projects.find((project) =>
              project.tasks.some((task) => task.id === linkedTaskId),
            )
          : undefined;
        const linkedProjectId = material.links.find((link) => link.projectId)?.projectId;
        const linkedProject =
          linkedTaskProject ?? projects.find((project) => project.id === linkedProjectId);

        return {
          id: `material:${material.id}`,
          kind: "material",
          title: material.title.trim() || material.fileName || "Без названия",
          context: linkedProject
            ? `Материал · ${linkedProject.title}`
            : "Материал без связей",
          projectId: linkedProject?.id,
          materialId: material.id,
        };
      });

    return [...projectResults, ...taskResults, ...materialResults].slice(0, 40);
  }, [materials, projects, query]);

  function openProject(projectId: string, section: ProjectSection = "tasks") {
    setSelectedId(projectId);
    setSelectedMaterialId("");
    setSelectedTaskId("");
    setProjectSection(section);
  }

  function openSearchResult(result: WorkspaceSearchResult) {
    setQuery("");

    if (result.kind === "project" && result.projectId) {
      openProject(result.projectId, "overview");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (result.kind === "task" && result.projectId && result.taskId) {
      setSelectedId(result.projectId);
      setSelectedTaskId(result.taskId);
      setSelectedMaterialId("");
      setProjectSection("tasks");

      window.setTimeout(() => {
        const taskRow = Array.from(
          document.querySelectorAll<HTMLElement>("[data-task-id]"),
        ).find((element) => element.dataset.taskId === result.taskId);
        taskRow?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    if (result.kind === "material" && result.materialId) {
      const targetProjectId = result.projectId ?? selectedProject?.id ?? projects[0]?.id;

      if (!targetProjectId) {
        return;
      }

      const selectionWillChange =
        targetProjectId !== selectedProject?.id || Boolean(selectedTaskId);

      pendingMaterialNavigationRef.current = selectionWillChange
        ? { id: result.materialId, scope: "all" }
        : null;
      setSelectedId(targetProjectId);
      setSelectedTaskId("");
      setMaterialScope("all");
      setSelectedMaterialId(result.materialId);
      setProjectSection("materials");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function persistWorkspace(
    nextWorkspace: WorkspaceData,
    previousWorkspace?: WorkspaceData,
  ) {
    setSaveStatus("saving");

    try {
      await saveWorkspace(nextWorkspace);
      setStorageError("");
      setSaveStatus("saved");
    } catch (error) {
      console.error(error);
      const errorMessage = getErrorMessage(error);
      setStorageError(
        errorMessage ? `Не удалось сохранить данные: ${errorMessage}` : "Не удалось сохранить данные.",
      );
      setSaveStatus("error");

      if (previousWorkspace) {
        latestWorkspaceRef.current = previousWorkspace;
        setProjects(previousWorkspace.projects);
        setMaterials(previousWorkspace.materials);
      }
    }
  }

  function commitWorkspace(
    nextWorkspace: WorkspaceData,
    options: { debounce?: boolean } = {},
  ) {
    const previousWorkspace = latestWorkspaceRef.current;

    latestWorkspaceRef.current = nextWorkspace;
    setProjects(nextWorkspace.projects);
    setMaterials(nextWorkspace.materials);

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveStatus(options.debounce ? "pending" : "saving");

    if (options.debounce) {
      saveTimerRef.current = window.setTimeout(() => {
        persistWorkspace(latestWorkspaceRef.current);
      }, 800);
      return;
    }

    persistWorkspace(nextWorkspace, previousWorkspace);
  }

  function commitProjects(nextProjects: Project[], options: { debounce?: boolean } = {}) {
    commitWorkspace(
      {
        projects: nextProjects,
        materials: latestWorkspaceRef.current.materials,
      },
      options,
    );
  }

  function updateProjectTasks(
    projectId: string,
    nextTasks: ProjectTask[],
    options: { debounce?: boolean } = {},
  ) {
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
      options,
    );
  }

  function updateMaterials(
    nextMaterials: ProjectMaterial[],
    options: { debounce?: boolean } = {},
  ) {
    commitWorkspace(
      {
        projects: latestWorkspaceRef.current.projects,
        materials: nextMaterials,
      },
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
    const projectTaskIds = new Set(project.tasks.map((task) => task.id));
    const nextMaterials = materials.map((material) => ({
      ...material,
      links: material.links.filter(
        (link) =>
          link.projectId !== project.id &&
          (!link.taskId || !projectTaskIds.has(link.taskId)),
      ),
    }));
    commitWorkspace({ projects: nextProjects, materials: nextMaterials });
    setSelectedId(nextProjects[0]?.id ?? "");
  }

  function addTask(project: Project, title: string, parentTaskId?: string) {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      return;
    }

    const now = new Date().toISOString();
    const task: ProjectTask = {
      id: crypto.randomUUID(),
      title: normalizedTitle,
      done: false,
      parentTaskId,
      position: getTaskSiblings(project.tasks, parentTaskId).length,
      createdAt: now,
      updatedAt: now,
    };

    updateProjectTasks(project.id, normalizeTaskPositions([...project.tasks, task]));
    setSelectedTaskId(task.id);
    setNewTaskTitle("");
  }

  function addSubtask(project: Project, parentTaskId: string) {
    const title = window.prompt("Название подзадачи");

    if (!title) {
      return;
    }

    addTask(project, title, parentTaskId);
  }

  function toggleTask(project: Project, taskId: string) {
    const now = new Date().toISOString();
    const nextTasks = project.tasks.map((task) =>
      task.id === taskId ? { ...task, done: !task.done, updatedAt: now } : task,
    );

    updateProjectTasks(project.id, nextTasks);
  }

  function updateTask(
    project: Project,
    taskId: string,
    patch: Partial<ProjectTask>,
    options: { debounce?: boolean } = {},
  ) {
    const now = new Date().toISOString();
    const nextTasks = project.tasks.map((task) =>
      task.id === taskId ? { ...task, ...patch, updatedAt: now } : task,
    );

    updateProjectTasks(project.id, nextTasks, options);
  }

  function deleteTask(project: Project, taskId: string) {
    const task = project.tasks.find((item) => item.id === taskId);
    const removedTaskIds = getTaskDescendantIds(project.tasks, taskId);

    if (!window.confirm(`Удалить задачу "${task?.title ?? "Без названия"}"?`)) {
      return;
    }

    const nextTasks = normalizeTaskPositions(
      project.tasks.filter((task) => !removedTaskIds.has(task.id)),
    );
    const now = new Date().toISOString();
    const nextMaterials = materials.map((material) => ({
      ...material,
      links: material.links.filter((link) => !link.taskId || !removedTaskIds.has(link.taskId)),
      updatedAt: material.links.some((link) => link.taskId && removedTaskIds.has(link.taskId))
        ? now
        : material.updatedAt,
    }));

    commitWorkspace({
      projects: projects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              tasks: nextTasks,
              progress: calculateProgress(nextTasks),
              updatedAt: now,
            }
          : item,
      ),
      materials: nextMaterials,
    });
  }

  function moveTask(project: Project, taskId: string, direction: -1 | 1) {
    const task = project.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    const siblings = getTaskSiblings(project.tasks, task.parentTaskId);
    const currentIndex = siblings.findIndex((item) => item.id === taskId);
    const targetTask = siblings[currentIndex + direction];

    if (!targetTask) {
      return;
    }

    const now = new Date().toISOString();
    const nextTasks = project.tasks.map((item) => {
      if (item.id === task.id) {
        return { ...item, position: targetTask.position ?? currentIndex + direction, updatedAt: now };
      }

      if (item.id === targetTask.id) {
        return { ...item, position: task.position ?? currentIndex, updatedAt: now };
      }

      return item;
    });

    updateProjectTasks(project.id, normalizeTaskPositions(nextTasks));
  }

  function addMaterial(project?: Project, taskId?: string) {
    const now = new Date().toISOString();
    const material: ProjectMaterial = {
      id: crypto.randomUUID(),
      title: "",
      kind: "text",
      markdown: "",
      links: taskId ? [{ taskId }] : project ? [{ projectId: project.id }] : [],
      createdAt: now,
      updatedAt: now,
    };

    updateMaterials([...materials, material]);
    setSelectedMaterialId(material.id);
    setProjectSection("materials");
  }

  function updateMaterialMarkdown(materialId: string, markdown: string) {
    const now = new Date().toISOString();
    const nextMaterials = materials.map((material) =>
      material.id === materialId ? { ...material, markdown, updatedAt: now } : material,
    );

    updateMaterials(nextMaterials, { debounce: true });
  }

  function renameMaterial(materialId: string, title: string) {
    const now = new Date().toISOString();
    const nextMaterials = materials.map((material) =>
      material.id === materialId ? { ...material, title, updatedAt: now } : material,
    );

    updateMaterials(nextMaterials, { debounce: true });
  }

  function toggleMaterialLink(materialId: string, link: MaterialLink) {
    const now = new Date().toISOString();
    const nextMaterials = materials.map((material) => {
      if (material.id !== materialId) {
        return material;
      }

      const hasLink = material.links.some(
        (item) => item.projectId === link.projectId && item.taskId === link.taskId,
      );

      return {
        ...material,
        links: hasLink
          ? material.links.filter(
              (item) => item.projectId !== link.projectId || item.taskId !== link.taskId,
            )
          : [...material.links, link],
        updatedAt: now,
      };
    });

    updateMaterials(nextMaterials);
  }

  function openMaterialLinks(material: ProjectMaterial) {
    const linkedTaskIds = new Set(
      material.links.flatMap((link) => (link.taskId ? [link.taskId] : [])),
    );
    const projectIdsWithLinkedTasks = projects
      .filter((project) => project.tasks.some((task) => linkedTaskIds.has(task.id)))
      .map((project) => project.id);

    setExpandedMaterialLinkProjectIds(new Set(projectIdsWithLinkedTasks));
    setLinkingMaterialId(material.id);
  }

  function toggleMaterialLinkProject(projectId: string) {
    setExpandedMaterialLinkProjectIds((currentProjectIds) => {
      const nextProjectIds = new Set(currentProjectIds);

      if (nextProjectIds.has(projectId)) {
        nextProjectIds.delete(projectId);
      } else {
        nextProjectIds.add(projectId);
      }

      return nextProjectIds;
    });
  }

  async function deleteMaterial(materialId: string) {
    const material = materials.find((item) => item.id === materialId);

    const materialLabel = material?.title.trim() || material?.fileName || "Без названия";

    if (!window.confirm(`Удалить материал "${materialLabel}"?`)) {
      return;
    }

    if (material?.filePath) {
      try {
        await deleteMaterialFile(material.filePath);
      } catch (error) {
        console.error(error);
        setStorageError(`Не удалось удалить PDF: ${getErrorMessage(error)}`);
        return;
      }
    }

    const nextMaterials = materials.filter((item) => item.id !== materialId);
    updateMaterials(nextMaterials);
    setSelectedMaterialId(nextMaterials[0]?.id ?? "");
  }

  async function handlePdfSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStorageError("Можно загрузить только PDF-файл.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setStorageError("Размер PDF не должен превышать 20 МБ.");
      return;
    }

    const materialId = crypto.randomUUID();
    setIsUploadingPdf(true);
    setStorageError("");

    try {
      const filePath = await uploadPdfFile(materialId, file);
      const now = new Date().toISOString();
      const links: MaterialLink[] = materialScope === "all"
        ? []
        : selectedTask
          ? [{ taskId: selectedTask.id }]
          : selectedProject
            ? [{ projectId: selectedProject.id }]
            : [];
      const material: ProjectMaterial = {
        id: materialId,
        title: file.name.replace(/\.pdf$/i, ""),
        kind: "pdf",
        markdown: "",
        filePath,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        fileSize: file.size,
        links,
        createdAt: now,
        updatedAt: now,
      };

      updateMaterials([...latestWorkspaceRef.current.materials, material]);
      setSelectedMaterialId(material.id);
      setProjectSection("materials");
    } catch (error) {
      console.error(error);
      setStorageError(`Не удалось загрузить PDF: ${getErrorMessage(error)}`);
    } finally {
      setIsUploadingPdf(false);
    }
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    clearPasswordRecoveryRequested();
    latestWorkspaceRef.current = { projects: [], materials: [] };
    setProjects([]);
    setMaterials([]);
    setSelectedId("");
    setSelectedMaterialId("");
    setSelectedTaskId("");
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

  if (isSupabaseConfigured && isPasswordRecovery) {
    return <PasswordRecoveryPanel onComplete={() => setIsPasswordRecovery(false)} />;
  }

  if (isSupabaseConfigured && !session) {
    return <AuthPanel />;
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
            placeholder="Проекты, задачи, материалы"
            aria-label="Поиск по рабочему пространству"
          />
          {query ? (
            <button
              className="search-clear"
              type="button"
              onClick={() => setQuery("")}
              aria-label="Очистить поиск"
            >
              <X size={15} />
            </button>
          ) : null}
        </label>

        {query.trim() ? (
          <div className="workspace-search-results" aria-live="polite">
            <div className="search-results-heading">
              <span>Результаты</span>
              <small>{searchResults.length}</small>
            </div>
            {searchResults.length ? (
              searchResults.map((result) => (
                <button
                  className="workspace-search-result"
                  key={result.id}
                  type="button"
                  onClick={() => openSearchResult(result)}
                >
                  <span className={`search-result-icon ${result.kind}`}>
                    {result.kind === "project" ? (
                      projects.find((project) => project.id === result.projectId)?.icon ?? "P"
                    ) : result.kind === "task" ? (
                      <ListChecks size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </span>
                  <span className="search-result-copy">
                    <strong>{result.title}</strong>
                    <small>{result.context}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="search-empty">Ничего не найдено.</p>
            )}
          </div>
        ) : (
          <>
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
                  className={
                    selectedProject?.id === project.id ? "project-row selected" : "project-row"
                  }
                  type="button"
                  onClick={() => openProject(project.id)}
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
          </>
        )}
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

            <nav className="project-tabs" aria-label="Разделы проекта">
              {(
                [
                  ["overview", "Обзор"],
                  ["tasks", "Задачи"],
                  ["materials", "Материалы"],
                ] as const
              ).map(([section, label]) => (
                <button
                  className={projectSection === section ? "active" : ""}
                  key={section}
                  type="button"
                  aria-current={projectSection === section ? "page" : undefined}
                  onClick={() => setProjectSection(section)}
                >
                  {label}
                  {section === "tasks" ? (
                    <span>{selectedProject.tasks.length}</span>
                  ) : section === "materials" ? (
                    <span>
                      {
                        materials.filter((material) =>
                          material.links.some(
                            (link) =>
                              link.projectId === selectedProject.id ||
                              (link.taskId &&
                                selectedProject.tasks.some((task) => task.id === link.taskId)),
                          ),
                        ).length
                      }
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>

            {projectSection === "overview" ? (
              <>
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
              </>
            ) : null}

            {projectSection === "tasks" ? (
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
                  addTask(selectedProject, newTaskTitle);
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
                  selectedTaskItems.map(({ task, depth, siblingIndex, siblingCount }) => (
                    <div
                      className={[
                        "task-row",
                        task.done ? "done" : "",
                        selectedTaskId === task.id ? "selected" : "",
                      ].filter(Boolean).join(" ")}
                      key={task.id}
                      data-task-id={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      style={{ marginLeft: depth ? `${depth * 20}px` : undefined }}
                    >
                      <div className="task-row-main">
                        <input
                          checked={task.done}
                          type="checkbox"
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleTask(selectedProject, task.id)}
                        />
                        <span>{task.title}</span>
                      </div>
                      <div className="task-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveTask(selectedProject, task.id, -1);
                          }}
                          disabled={siblingIndex === 0}
                          title="Выше"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveTask(selectedProject, task.id, 1);
                          }}
                          disabled={siblingIndex === siblingCount - 1}
                          title="Ниже"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            addSubtask(selectedProject, task.id);
                          }}
                          title="Добавить подзадачу"
                        >
                          <Plus size={15} />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteTask(selectedProject, task.id);
                          }}
                          title="Удалить задачу"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">План пока пуст. Добавь первый конкретный шаг.</p>
                )}
              </div>

              {selectedTask ? (
                <div className="task-detail-panel">
                  <div className="task-detail-header">
                    <div>
                      <span className="label">Задача</span>
                      <h3>{selectedTask.title}</h3>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setSelectedTaskId("")}
                      title="Закрыть"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="task-detail-grid">
                    <label>
                      Название
                      <input
                        value={selectedTask.title}
                        onChange={(event) =>
                          updateTask(
                            selectedProject,
                            selectedTask.id,
                            { title: event.target.value },
                            { debounce: true },
                          )
                        }
                      />
                    </label>
                    <label>
                      Статус
                      <select
                        value={selectedTask.done ? "done" : "active"}
                        onChange={(event) =>
                          updateTask(selectedProject, selectedTask.id, { done: event.target.value === "done" })
                        }
                      >
                        <option value="active">В работе</option>
                        <option value="done">Готово</option>
                      </select>
                    </label>
                    <label>
                      Начало
                      <input
                        type="date"
                        value={selectedTask.startDate ?? ""}
                        onChange={(event) =>
                          updateTask(selectedProject, selectedTask.id, { startDate: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Срок
                      <input
                        type="date"
                        value={selectedTask.dueDate ?? ""}
                        onChange={(event) =>
                          updateTask(selectedProject, selectedTask.id, { dueDate: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <label className="task-description-field">
                    Описание
                    <textarea
                      value={selectedTask.description ?? ""}
                      onChange={(event) =>
                        updateTask(
                          selectedProject,
                          selectedTask.id,
                          { description: event.target.value },
                          { debounce: true },
                        )
                      }
                      placeholder="Контекст, критерии готовности, ссылки"
                    />
                  </label>

                  <div className="task-detail-columns">
                    <div>
                      <div className="task-detail-subtitle">
                        <h4>Подзадачи</h4>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => addSubtask(selectedProject, selectedTask.id)}
                        >
                          <Plus size={15} />
                          Подзадача
                        </button>
                      </div>
                      <div className="compact-list">
                        {selectedTaskSubtasks.length ? (
                          selectedTaskSubtasks.map((task) => (
                            <button
                              className="compact-row"
                              key={task.id}
                              type="button"
                              onClick={() => setSelectedTaskId(task.id)}
                            >
                              <span>{task.title}</span>
                              <small>{task.done ? "Готово" : "В работе"}</small>
                            </button>
                          ))
                        ) : (
                          <p className="muted">У этой задачи пока нет подзадач.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="task-detail-subtitle">
                        <h4>Материалы</h4>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => addMaterial(selectedProject, selectedTask.id)}
                        >
                          <Plus size={15} />
                          Материал
                        </button>
                      </div>
                      <div className="linked-material-list">
                        {selectedTaskMaterials.length ? (
                          selectedTaskMaterials.map((material) => (
                            <details className="linked-material" key={material.id}>
                              <summary>
                                <span>{material.title.trim() || material.fileName || "Без названия"}</span>
                                <button
                                  className="text-button"
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setProjectSection("materials");
                                    setMaterialScope("context");
                                    setSelectedMaterialId(material.id);
                                  }}
                                >
                                  Открыть
                                </button>
                              </summary>
                              {material.kind === "pdf" ? (
                                <div className="linked-material-file">
                                  <FileUp size={16} />
                                  <span>{material.fileName}</span>
                                  <small>{formatFileSize(material.fileSize)}</small>
                                </div>
                              ) : (
                                <pre>{material.markdown || "Материал пока пуст."}</pre>
                              )}
                            </details>
                          ))
                        ) : (
                          <p className="muted">К задаче пока не привязаны материалы.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedProject.tasks.length ? (
                <div className="task-detail-empty">
                  <p>Выбери задачу в списке, чтобы открыть сроки, описание, подзадачи и материалы.</p>
                </div>
              ) : null}
              </section>
            ) : null}

            {projectSection === "materials" ? (
              <section className="section-block materials-section">
              <div className="section-title-row">
                <div>
                  <h3>{selectedTask ? "Материалы задачи" : "Материалы проекта"}</h3>
                  <p>
                    {materialScope === "all"
                      ? "Все документы и PDF, включая материалы без связей."
                      : selectedTask
                        ? `Только материалы задачи «${selectedTask.title}».`
                        : "Только материалы, связанные непосредственно с проектом."}
                  </p>
                </div>
                <div className="material-section-actions">
                  <div className="segmented-control" aria-label="Область материалов">
                    <button
                      className={materialScope === "context" ? "selected" : ""}
                      type="button"
                      onClick={() => setMaterialScope("context")}
                    >
                      {selectedTask ? "Задача" : "Проект"}
                    </button>
                    <button
                      className={materialScope === "all" ? "selected" : ""}
                      type="button"
                      onClick={() => setMaterialScope("all")}
                    >
                      Все
                    </button>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      addMaterial(
                        materialScope === "all" ? undefined : selectedProject,
                        materialScope === "context" ? selectedTask?.id : undefined,
                      )
                    }
                  >
                    <Plus size={16} />
                    Документ
                  </button>
                  <button
                    className="text-button primary"
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={isUploadingPdf}
                  >
                    <FileUp size={16} />
                    {isUploadingPdf ? "Загрузка..." : "PDF"}
                  </button>
                  <input
                    ref={pdfInputRef}
                    className="visually-hidden"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handlePdfSelected}
                  />
                </div>
              </div>

              <div className="materials-layout">
                <div className="material-list" aria-label="Материалы">
                  {contextualMaterials.length ? (
                    contextualMaterials.map((material) => (
                      <button
                        className={
                          selectedMaterial?.id === material.id ? "material-row selected" : "material-row"
                        }
                        key={material.id}
                        type="button"
                        onClick={() => setSelectedMaterialId(material.id)}
                      >
                        {material.kind === "pdf" ? <FileUp size={16} /> : <FileText size={16} />}
                        <span className="material-row-copy">
                          <span>{material.title.trim() || material.fileName || "Без названия"}</span>
                          <small>
                            {materialScope === "all"
                              ? material.links.length
                                ? `${material.links.length} связ.`
                                : "Без связей"
                              : material.kind === "pdf"
                                ? `PDF${material.fileSize ? ` · ${formatFileSize(material.fileSize)}` : ""}`
                                : "Документ"}
                          </small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="muted">
                      {materialScope === "all"
                        ? "Пока нет материалов."
                        : selectedTask
                          ? "К этой задаче материалы не привязаны."
                          : "К проекту материалы не привязаны."}
                    </p>
                  )}
                </div>

                <div className="material-editor-panel">
                  {selectedMaterial ? (
                    <>
                      <div className="material-title-row">
                        <input
                          value={selectedMaterial.title}
                          onChange={(event) => renameMaterial(selectedMaterial.id, event.target.value)}
                          aria-label="Название материала"
                          placeholder="Без названия"
                        />
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => openMaterialLinks(selectedMaterial)}
                          title="Изменить связи"
                        >
                          <Link2 size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => deleteMaterial(selectedMaterial.id)}
                          title="Удалить материал"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <button
                        className="material-link-summary"
                        type="button"
                        onClick={() => openMaterialLinks(selectedMaterial)}
                      >
                        <Link2 size={15} />
                        {selectedMaterial.links.length
                          ? `Связи: ${selectedMaterial.links.length}`
                          : "Материал без связей"}
                      </button>
                      {selectedMaterial.kind === "pdf" ? (
                        <PdfMaterialViewer material={selectedMaterial} />
                      ) : (
                        <MaterialEditor
                          key={selectedMaterial.id}
                          markdown={selectedMaterial.markdown}
                          onChange={(markdown) =>
                            updateMaterialMarkdown(selectedMaterial.id, markdown)
                          }
                        />
                      )}
                    </>
                  ) : (
                    <div className="material-empty">
                      <h3>Здесь пока пусто</h3>
                      <p>
                        Создай документ или загрузи PDF. Связи с проектами и задачами можно
                        изменить позже.
                      </p>
                      <button
                        className="text-button primary"
                        type="button"
                        onClick={() =>
                          addMaterial(
                            materialScope === "all" ? undefined : selectedProject,
                            materialScope === "context" ? selectedTask?.id : undefined,
                          )
                        }
                      >
                        <Plus size={16} />
                        Новый документ
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </section>
            ) : null}
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

      {linkingMaterial ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setLinkingMaterialId("");
            }
          }}
        >
          <section
            className="modal-panel material-links-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="material-links-title"
          >
            <div className="form-header">
              <div>
                <p className="eyebrow">Материал</p>
                <h2 id="material-links-title">Связи</h2>
                <p>{linkingMaterial.title.trim() || linkingMaterial.fileName || "Без названия"}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setLinkingMaterialId("")}
                title="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <div className="material-link-targets">
              {projects.map((project) => {
                const isExpanded = expandedMaterialLinkProjectIds.has(project.id);
                const taskItems = getTaskTreeItems(project.tasks);

                return (
                  <div className="material-link-project" key={project.id}>
                    <div className="project-link-row">
                      <label className="material-link-option project-link-option">
                        <input
                          type="checkbox"
                          checked={linkingMaterial.links.some(
                            (link) => link.projectId === project.id,
                          )}
                          onChange={() =>
                            toggleMaterialLink(linkingMaterial.id, { projectId: project.id })
                          }
                        />
                        <span>{project.title}</span>
                        <small>Проект</small>
                      </label>
                      {taskItems.length ? (
                        <button
                          className="project-tasks-toggle"
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Скрыть" : "Показать"} задачи проекта «${project.title}»`}
                          title={`${isExpanded ? "Скрыть" : "Показать"} задачи (${taskItems.length})`}
                          onClick={() => toggleMaterialLinkProject(project.id)}
                        >
                          <span>{taskItems.length}</span>
                          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        </button>
                      ) : null}
                    </div>
                    {isExpanded
                      ? taskItems.map(({ task, depth }) => (
                          <label
                            className="material-link-option"
                            key={task.id}
                            style={{ paddingLeft: `${28 + depth * 18}px` }}
                          >
                            <input
                              type="checkbox"
                              checked={linkingMaterial.links.some((link) => link.taskId === task.id)}
                              onChange={() =>
                                toggleMaterialLink(linkingMaterial.id, { taskId: task.id })
                              }
                            />
                            <span>{task.title}</span>
                            <small>Задача</small>
                          </label>
                        ))
                      : null}
                  </div>
                );
              })}
            </div>

            <div className="form-actions">
              <span className="muted">
                {linkingMaterial.links.length
                  ? `Выбрано связей: ${linkingMaterial.links.length}`
                  : "Материал останется свободным"}
              </span>
              <button
                className="text-button primary"
                type="button"
                onClick={() => setLinkingMaterialId("")}
              >
                Готово
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
