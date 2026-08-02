import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Archive,
  Edit3,
  Menu,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { AiMaterialDraft } from "./aiAssistant";
import { AiAssistantDialog } from "./components/AiAssistantDialog";
import {
  AuthPanel,
  PasswordRecoveryPanel,
  clearPasswordRecoveryRequested,
  getHashSessionTokens,
  getPasswordRecoveryRedirectUrl,
  getRecoveryCode,
  isPasswordRecoveryRequested,
  isRecoveryUrl,
  setPasswordRecoveryRequested,
} from "./components/AuthPanels";
import { DigestSettingsDialog } from "./components/DigestSettingsDialog";
import { MaterialLinksDialog } from "./components/MaterialLinksDialog";
import { MaterialsSection } from "./components/MaterialsSection";
import { ProjectFormDialog } from "./components/ProjectFormDialog";
import { ProjectOverview } from "./components/ProjectOverview";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { TaskSection } from "./components/TaskSection";
import {
  deleteMaterialFile,
  loadWorkspace,
  saveWorkspaceChanges,
  subscribeToWorkspaceChanges,
  uploadPdfFile,
  WorkspaceConflictError,
  type WorkspaceRealtimeChange,
} from "./storage";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  type ProjectSection,
  type MaterialScope,
  type SaveStatus,
  type WorkspaceSearchResult,
  calculateProgress,
  createProject,
  emptyDraft,
  getErrorMessage,
  getSaveStatusLabel,
  getTaskDescendantIds,
  getTaskSiblings,
  getTaskTreeItems,
  normalizeTaskPositions,
  parseTags,
  statusLabels,
  toDraft,
} from "./projectModel";
import {
  MaterialLink,
  Project,
  ProjectDraft,
  ProjectMaterial,
  ProjectStatus,
  ProjectTask,
  WorkspaceData,
} from "./types";

const NAVIGATION_STORAGE_PREFIX = "loom:navigation";

type SavedNavigation = {
  projectId: string;
  taskId: string;
  section: ProjectSection;
  materialScope: MaterialScope;
  materialId: string;
};

type UrlNavigation = {
  hasNavigation: boolean;
  projectId: string;
  taskId: string;
  section: ProjectSection;
  materialScope: MaterialScope;
  materialId: string;
};

function loadUrlNavigation(): UrlNavigation {
  const params = new URLSearchParams(window.location.search);
  const hasNavigation = ["project", "task", "section", "scope", "material"].some((key) =>
    params.has(key),
  );
  const sectionValue = params.get("section");
  const scopeValue = params.get("scope");

  return {
    hasNavigation,
    projectId: params.get("project") ?? "",
    taskId: params.get("task") ?? "",
    section: ["overview", "tasks", "materials"].includes(sectionValue ?? "")
      ? sectionValue as ProjectSection
      : "tasks",
    materialScope: ["task", "project", "all"].includes(scopeValue ?? "")
      ? scopeValue as MaterialScope
      : "project",
    materialId: params.get("material") ?? "",
  };
}

function writeNavigationUrl(navigation: SavedNavigation, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  const setOptionalParam = (key: string, value: string) => {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  };

  setOptionalParam("project", navigation.projectId);
  setOptionalParam("task", navigation.taskId);
  url.searchParams.set("section", navigation.section);
  setOptionalParam(
    "scope",
    navigation.section === "materials" ? navigation.materialScope : "",
  );
  setOptionalParam(
    "material",
    navigation.section === "materials" ? navigation.materialId : "",
  );

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl === currentUrl) {
    return;
  }

  if (mode === "push") {
    window.history.pushState({}, "", nextUrl);
  } else {
    window.history.replaceState({}, "", nextUrl);
  }
}

function getNavigationStorageKey(userId?: string) {
  return `${NAVIGATION_STORAGE_PREFIX}:${userId ?? "local"}`;
}

function loadSavedNavigation(userId?: string): SavedNavigation | null {
  try {
    const value = window.localStorage.getItem(getNavigationStorageKey(userId));

    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<SavedNavigation>;
    const section = ["overview", "tasks", "materials"].includes(parsed.section ?? "")
      ? parsed.section as ProjectSection
      : "tasks";
    const materialScope = ["task", "project", "all"].includes(parsed.materialScope ?? "")
      ? parsed.materialScope as MaterialScope
      : "project";

    return {
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : "",
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : "",
      section,
      materialScope,
      materialId: typeof parsed.materialId === "string" ? parsed.materialId : "",
    };
  } catch {
    return null;
  }
}

function saveNavigation(userId: string | undefined, navigation: SavedNavigation) {
  try {
    window.localStorage.setItem(
      getNavigationStorageKey(userId),
      JSON.stringify(navigation),
    );
  } catch {
    // Навигация не критична: приложение продолжит работать без localStorage.
  }
}

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mergeWorkspaceRevisions(
  currentWorkspace: WorkspaceData,
  savedWorkspace: WorkspaceData,
): WorkspaceData {
  const savedProjects = new Map(
    savedWorkspace.projects.map((project) => [project.id, project]),
  );
  const savedTasks = new Map(
    savedWorkspace.projects.flatMap((project) =>
      project.tasks.map((task) => [task.id, task] as const),
    ),
  );
  const savedMaterials = new Map(
    savedWorkspace.materials.map((material) => [material.id, material]),
  );

  return {
    projects: currentWorkspace.projects.map((project) => ({
      ...project,
      revision: savedProjects.get(project.id)?.revision ?? project.revision,
      tasks: project.tasks.map((task) => ({
        ...task,
        revision: savedTasks.get(task.id)?.revision ?? task.revision,
      })),
    })),
    materials: currentWorkspace.materials.map((material) => ({
      ...material,
      revision: savedMaterials.get(material.id)?.revision ?? material.revision,
    })),
  };
}

function entitySignature<T extends { revision: number }>(entity: T) {
  const { revision: _revision, ...value } = entity;
  return JSON.stringify(value);
}

function projectSignature(project: Project) {
  const {
    revision: _revision,
    tasks: _tasks,
    progress: _progress,
    updatedAt: _updatedAt,
    ...value
  } = project;
  return JSON.stringify(value);
}

function mergeEntityMaps<T extends { id: string; revision: number }>(
  baseItems: T[],
  localItems: T[],
  remoteItems: T[],
  signature: (item: T) => string = entitySignature,
) {
  const base = new Map(baseItems.map((item) => [item.id, item]));
  const local = new Map(localItems.map((item) => [item.id, item]));
  const remote = new Map(remoteItems.map((item) => [item.id, item]));
  const ids = Array.from(new Set([...local.keys(), ...remote.keys(), ...base.keys()]));
  const items: T[] = [];
  let hasConflict = false;

  for (const id of ids) {
    const baseItem = base.get(id);
    const localItem = local.get(id);
    const remoteItem = remote.get(id);
    const localChanged = baseItem
      ? !localItem || signature(localItem) !== signature(baseItem)
      : Boolean(localItem);
    const remoteChanged = baseItem
      ? !remoteItem || signature(remoteItem) !== signature(baseItem)
      : Boolean(remoteItem);

    if (localChanged && remoteChanged) {
      if (!localItem && !remoteItem) {
        continue;
      }

      if (
        !localItem ||
        !remoteItem ||
        signature(localItem) !== signature(remoteItem)
      ) {
        hasConflict = true;

        if (localItem) {
          items.push(localItem);
        }
        continue;
      }
    }

    const selectedItem = remoteChanged ? remoteItem : localItem;

    if (selectedItem) {
      items.push(selectedItem);
    }
  }

  return { items, hasConflict };
}

function flattenWorkspaceTasks(workspace: WorkspaceData) {
  return workspace.projects.flatMap((project) => project.tasks);
}

function isRealtimeChangeAlreadyApplied(
  change: WorkspaceRealtimeChange,
  workspace: WorkspaceData,
) {
  if (!change.entityId) {
    return false;
  }

  const entity =
    change.table === "projects"
      ? workspace.projects.find((project) => project.id === change.entityId)
      : change.table === "project_tasks"
        ? flattenWorkspaceTasks(workspace).find((task) => task.id === change.entityId)
        : change.table === "materials"
          ? workspace.materials.find((material) => material.id === change.entityId)
          : undefined;

  if (change.eventType === "DELETE") {
    return !entity;
  }

  return Boolean(
    entity && change.revision !== undefined && entity.revision >= change.revision,
  );
}

function mergeRealtimeWorkspaces(
  base: WorkspaceData,
  local: WorkspaceData,
  remote: WorkspaceData,
) {
  const mergedProjects = mergeEntityMaps(
    base.projects,
    local.projects,
    remote.projects,
    projectSignature,
  );
  const mergedTasks = mergeEntityMaps(
    flattenWorkspaceTasks(base),
    flattenWorkspaceTasks(local),
    flattenWorkspaceTasks(remote),
  );
  const mergedMaterials = mergeEntityMaps(
    base.materials,
    local.materials,
    remote.materials,
  );
  const tasksByProject = new Map<string, ProjectTask[]>();
  const taskProjectIds = new Map<string, string>();

  for (const workspace of [base, local, remote]) {
    for (const project of workspace.projects) {
      for (const task of project.tasks) {
        taskProjectIds.set(task.id, project.id);
      }
    }
  }

  for (const task of mergedTasks.items) {
    const projectId = taskProjectIds.get(task.id);

    if (!projectId) {
      continue;
    }

    const projectTasks = tasksByProject.get(projectId) ?? [];
    projectTasks.push(task);
    tasksByProject.set(projectId, projectTasks);
  }

  return {
    workspace: {
      projects: mergedProjects.items.map((project) => ({
        ...project,
        tasks: tasksByProject.get(project.id) ?? [],
      })),
      materials: mergedMaterials.items,
    },
    hasConflict:
      mergedProjects.hasConflict ||
      mergedTasks.hasConflict ||
      mergedMaterials.hasConflict,
  };
}

export function App() {
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const workspaceVersionRef = useRef(0);
  const pendingMaterialNavigationRef = useRef<{ id: string; scope: MaterialScope } | null>(
    null,
  );
  const latestWorkspaceRef = useRef<WorkspaceData>({ projects: [], materials: [] });
  const persistedWorkspaceRef = useRef<WorkspaceData>({ projects: [], materials: [] });
  const realtimeTimerRef = useRef<number | null>(null);
  const pendingRealtimeChangesRef = useRef<WorkspaceRealtimeChange[]>([]);
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
  const [materialScope, setMaterialScope] = useState<MaterialScope>("project");
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
  const [isDigestSettingsOpen, setIsDigestSettingsOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isProjectDrawerOpen, setIsProjectDrawerOpen] = useState(false);
  const [remoteConflict, setRemoteConflict] = useState<WorkspaceData | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => window.matchMedia("(max-width: 860px)").matches,
  );
  const mobileProjectButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    latestWorkspaceRef.current = { projects, materials };
  }, [projects, materials]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 860px)");
    const handleLayoutChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);

      if (!event.matches) {
        setIsProjectDrawerOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleLayoutChange);
    return () => mediaQuery.removeEventListener("change", handleLayoutChange);
  }, []);

  useEffect(() => {
    if (!isProjectDrawerOpen || !isMobileLayout) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProjectDrawerOpen(false);
        window.requestAnimationFrame(() => mobileProjectButtonRef.current?.focus());
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".mobile-sidebar-close")?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileLayout, isProjectDrawerOpen]);

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
      persistedWorkspaceRef.current = { projects: [], materials: [] };
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
        persistedWorkspaceRef.current = loadedWorkspace;
        setProjects(loadedWorkspace.projects);
        setMaterials(loadedWorkspace.materials);
        setRemoteConflict(null);
        const savedNavigation = loadSavedNavigation(session?.user.id);
        const urlNavigation = loadUrlNavigation();
        const restoredNavigation = urlNavigation.hasNavigation
          ? urlNavigation
          : savedNavigation;
        const restoredProject =
          loadedWorkspace.projects.find((project) => project.id === restoredNavigation?.projectId) ??
          loadedWorkspace.projects[0];
        const restoredTask = restoredProject?.tasks.find(
          (task) => task.id === restoredNavigation?.taskId,
        );
        const restoredScope =
          restoredNavigation?.materialScope === "task" && !restoredTask
            ? "project"
            : restoredNavigation?.materialScope ?? "project";
        const restoredMaterialId = loadedWorkspace.materials.some(
          (material) => material.id === restoredNavigation?.materialId,
        )
          ? restoredNavigation?.materialId ?? ""
          : "";

        if (restoredNavigation?.section === "materials") {
          pendingMaterialNavigationRef.current = {
            id: restoredMaterialId,
            scope: restoredScope,
          };
        }

        setSelectedId(restoredProject?.id ?? "");
        setSelectedTaskId(restoredTask?.id ?? "");
        setProjectSection(restoredNavigation?.section ?? "tasks");
        setMaterialScope(restoredScope);
        setSelectedMaterialId(restoredMaterialId);
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
    if (!session || !supabase) {
      return;
    }

    const unsubscribe = subscribeToWorkspaceChanges((change) => {
      pendingRealtimeChangesRef.current.push(change);

      if (realtimeTimerRef.current) {
        window.clearTimeout(realtimeTimerRef.current);
      }

      realtimeTimerRef.current = window.setTimeout(async () => {
        realtimeTimerRef.current = null;

        try {
          await saveQueueRef.current.catch(() => undefined);
          const pendingChanges = pendingRealtimeChangesRef.current.splice(0);

          if (
            pendingChanges.length > 0 &&
            pendingChanges.every((pendingChange) =>
              isRealtimeChangeAlreadyApplied(
                pendingChange,
                persistedWorkspaceRef.current,
              ),
            )
          ) {
            return;
          }

          const remoteWorkspace = await loadWorkspace({ importLocalIfEmpty: false });
          const merged = mergeRealtimeWorkspaces(
            persistedWorkspaceRef.current,
            latestWorkspaceRef.current,
            remoteWorkspace,
          );

          persistedWorkspaceRef.current = remoteWorkspace;
          latestWorkspaceRef.current = merged.workspace;
          setProjects(merged.workspace.projects);
          setMaterials(merged.workspace.materials);

          if (merged.hasConflict) {
            if (saveTimerRef.current) {
              window.clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }

            setRemoteConflict(remoteWorkspace);
            setStorageError(
              "Этот объект изменён в другом окне. Локальная версия оставлена на экране и не перезаписана.",
            );
            setSaveStatus("error");
          } else {
            setRemoteConflict(null);

            if (!saveTimerRef.current) {
              setStorageError("");
              setSaveStatus("saved");
            }
          }
        } catch (error) {
          console.error(error);
        }
      }, 250);
    });

    return () => {
      unsubscribe();

      if (realtimeTimerRef.current) {
        window.clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }

      pendingRealtimeChangesRef.current = [];
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
  const selectedProjectMaterials = selectedProject
    ? materials.filter((material) =>
        material.links.some(
          (link) =>
            link.projectId === selectedProject.id ||
            (link.taskId &&
              selectedProject.tasks.some((task) => task.id === link.taskId)),
        ),
      )
    : [];
  const contextualMaterials = materialScope === "all"
    ? materials
    : materialScope === "task"
      ? selectedTaskMaterials
      : selectedProjectMaterials;
  const selectedMaterial = contextualMaterials.find(
    (material) => material.id === selectedMaterialId,
  );
  const linkingMaterial = materials.find((material) => material.id === linkingMaterialId);

  function pushNavigationUrl(overrides: Partial<SavedNavigation>) {
    writeNavigationUrl(
      {
        projectId: selectedProject?.id ?? "",
        taskId: selectedTask?.id ?? "",
        section: projectSection,
        materialScope,
        materialId: selectedMaterial?.id ?? "",
        ...overrides,
      },
      "push",
    );
  }

  useEffect(() => {
    const handlePopState = () => {
      const navigation = loadUrlNavigation();
      const workspace = latestWorkspaceRef.current;
      const restoredProject =
        workspace.projects.find((project) => project.id === navigation.projectId) ??
        workspace.projects[0];
      const restoredTask = restoredProject?.tasks.find(
        (task) => task.id === navigation.taskId,
      );
      const restoredScope =
        navigation.materialScope === "task" && !restoredTask
          ? "project"
          : navigation.materialScope;
      const restoredMaterialId = workspace.materials.some(
        (material) => material.id === navigation.materialId,
      )
        ? navigation.materialId
        : "";
      const selectionWillChange =
        restoredProject?.id !== selectedId || (restoredTask?.id ?? "") !== selectedTaskId;

      pendingMaterialNavigationRef.current =
        navigation.section === "materials" && selectionWillChange
          ? { id: restoredMaterialId, scope: restoredScope }
          : null;
      setSelectedId(restoredProject?.id ?? "");
      setSelectedTaskId(restoredTask?.id ?? "");
      setProjectSection(navigation.section);
      setMaterialScope(restoredScope);
      setSelectedMaterialId(restoredMaterialId);
      setIsProjectDrawerOpen(false);
      window.scrollTo({ top: 0 });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedId, selectedTaskId]);

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

    setMaterialScope("project");
    setSelectedMaterialId("");
  }, [selectedId, selectedTaskId]);

  useEffect(() => {
    if (isLoadingProjects || !selectedProject) {
      return;
    }

    saveNavigation(session?.user.id, {
      projectId: selectedProject.id,
      taskId: selectedTask?.id ?? "",
      section: projectSection,
      materialScope,
      materialId: selectedMaterial?.id ?? "",
    });

    writeNavigationUrl(
      {
        projectId: selectedProject.id,
        taskId: selectedTask?.id ?? "",
        section: projectSection,
        materialScope,
        materialId: selectedMaterial?.id ?? "",
      },
      "replace",
    );
  }, [
    isLoadingProjects,
    materialScope,
    projectSection,
    selectedMaterial?.id,
    selectedProject?.id,
    selectedTask?.id,
    session?.user.id,
  ]);

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
    pushNavigationUrl({
      projectId,
      taskId: "",
      section,
      materialScope: "project",
      materialId: "",
    });
    setSelectedId(projectId);
    setSelectedMaterialId("");
    setSelectedTaskId("");
    setProjectSection(section);
    setIsProjectDrawerOpen(false);
  }

  function changeMaterialScope(scope: MaterialScope) {
    pushNavigationUrl({
      section: "materials",
      materialScope: scope,
      materialId: "",
    });
    setMaterialScope(scope);
    setSelectedMaterialId("");
  }

  function openProjectSection(section: ProjectSection) {
    const nextScope = section === "materials" ? "project" : materialScope;

    pushNavigationUrl({
      section,
      materialScope: nextScope,
      materialId: "",
    });

    if (section === "materials") {
      setMaterialScope("project");
      setSelectedMaterialId("");
    }

    setProjectSection(section);
  }

  function openTask(taskId: string) {
    pushNavigationUrl({
      taskId,
      section: "tasks",
      materialId: "",
    });
    setSelectedTaskId(taskId);
  }

  function openMaterial(materialId: string) {
    pushNavigationUrl({
      section: "materials",
      materialId,
    });
    setSelectedMaterialId(materialId);
  }

  function closeProjectDrawer(restoreFocus = false) {
    setIsProjectDrawerOpen(false);

    if (restoreFocus) {
      window.requestAnimationFrame(() => mobileProjectButtonRef.current?.focus());
    }
  }

  function openSearchResult(result: WorkspaceSearchResult) {
    setQuery("");
    setIsProjectDrawerOpen(false);

    if (result.kind === "project" && result.projectId) {
      openProject(result.projectId, "overview");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (result.kind === "task" && result.projectId && result.taskId) {
      pushNavigationUrl({
        projectId: result.projectId,
        taskId: result.taskId,
        section: "tasks",
        materialId: "",
      });
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
      pushNavigationUrl({
        projectId: targetProjectId,
        taskId: "",
        section: "materials",
        materialScope: "all",
        materialId: result.materialId,
      });
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
    version = workspaceVersionRef.current,
  ) {
    setSaveStatus("saving");
    const saveOperation = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const savedWorkspace = await saveWorkspaceChanges(
          persistedWorkspaceRef.current,
          nextWorkspace,
        );
        persistedWorkspaceRef.current = savedWorkspace;
        const currentWorkspace = latestWorkspaceRef.current;
        const mergedWorkspace = mergeWorkspaceRevisions(currentWorkspace, savedWorkspace);
        latestWorkspaceRef.current = mergedWorkspace;
        setProjects(mergedWorkspace.projects);
        setMaterials(mergedWorkspace.materials);
      });
    saveQueueRef.current = saveOperation;

    try {
      await saveOperation;

      if (version === workspaceVersionRef.current) {
        setStorageError("");
        setSaveStatus("saved");
        setRemoteConflict(null);
      }
    } catch (error) {
      console.error(error);

      if (version !== workspaceVersionRef.current) {
        return;
      }

      if (error instanceof WorkspaceConflictError) {
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }

        try {
          const remoteWorkspace = await loadWorkspace({ importLocalIfEmpty: false });
          setRemoteConflict(remoteWorkspace);
          setStorageError(
            "Данные изменились в другом окне. Ваша версия сохранена на экране и не была отправлена поверх чужой.",
          );
        } catch (loadError) {
          console.error(loadError);
          setStorageError("Обнаружен конфликт изменений. Не удалось загрузить новую версию.");
        }
        setSaveStatus("error");
        return;
      }

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

    if (remoteConflict) {
      latestWorkspaceRef.current = nextWorkspace;
      setProjects(nextWorkspace.projects);
      setMaterials(nextWorkspace.materials);
      setSaveStatus("error");
      return;
    }

    const version = workspaceVersionRef.current + 1;
    workspaceVersionRef.current = version;

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
        saveTimerRef.current = null;
        persistWorkspace(latestWorkspaceRef.current, undefined, version);
      }, 800);
      return;
    }

    persistWorkspace(nextWorkspace, previousWorkspace, version);
  }

  function acceptRemoteChanges() {
    if (!remoteConflict) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    workspaceVersionRef.current += 1;
    persistedWorkspaceRef.current = remoteConflict;
    latestWorkspaceRef.current = remoteConflict;
    setProjects(remoteConflict.projects);
    setMaterials(remoteConflict.materials);
    setRemoteConflict(null);
    setStorageError("");
    setSaveStatus("saved");
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
      revision: 0,
      title: normalizedTitle,
      done: false,
      parentTaskId,
      position: getTaskSiblings(project.tasks, parentTaskId).length,
      startDate: getLocalDateValue(),
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
      revision: 0,
      title: "",
      kind: "text",
      markdown: "",
      links: taskId ? [{ taskId }] : project ? [{ projectId: project.id }] : [],
      createdAt: now,
      updatedAt: now,
    };

    updateMaterials([...materials, material]);
    setMaterialScope(taskId ? "task" : project ? "project" : "all");
    setSelectedMaterialId(material.id);
    setProjectSection("materials");
  }

  function saveAiMaterial(draft: AiMaterialDraft, taskId?: string) {
    if (!selectedProject) {
      return;
    }

    const sourceMarkdown = draft.sources.length
      ? [
          "",
          "## Источники",
          "",
          ...draft.sources.map((source) => {
            const title = source.title.replace(/\[|\]/g, "");
            const url = source.url.replace(/\)/g, "%29");
            return `- [${title}](${url})`;
          }),
        ].join("\n")
      : "";
    const now = new Date().toISOString();
    const material: ProjectMaterial = {
      id: crypto.randomUUID(),
      revision: 0,
      title: draft.title.trim(),
      kind: "text",
      markdown: `${draft.markdown.trim()}${sourceMarkdown}`,
      links: taskId ? [{ taskId }] : [{ projectId: selectedProject.id }],
      createdAt: now,
      updatedAt: now,
    };

    updateMaterials([...latestWorkspaceRef.current.materials, material]);
    setSelectedTaskId(taskId ?? "");
    setMaterialScope(taskId ? "task" : "project");
    setSelectedMaterialId(material.id);
    setProjectSection("materials");
    setIsAiAssistantOpen(false);
  }

  function updateMaterialMarkdown(materialId: string, markdown: string) {
    const now = new Date().toISOString();
    const nextMaterials = latestWorkspaceRef.current.materials.map((material) =>
      material.id === materialId ? { ...material, markdown, updatedAt: now } : material,
    );

    updateMaterials(nextMaterials, { debounce: true });
  }

  function saveMaterialMarkdown(materialId: string, markdown: string) {
    const material = latestWorkspaceRef.current.materials.find(
      (item) => item.id === materialId,
    );
    const persistedMaterial = persistedWorkspaceRef.current.materials.find(
      (item) => item.id === materialId,
    );

    if (!material) {
      return;
    }

    if (
      material.markdown === markdown &&
      persistedMaterial?.markdown === markdown &&
      saveTimerRef.current === null
    ) {
      return;
    }

    const nextMaterials = latestWorkspaceRef.current.materials.map((item) =>
      item.id === materialId
        ? {
            ...item,
            markdown,
            updatedAt: item.markdown === markdown ? item.updatedAt : new Date().toISOString(),
          }
        : item,
    );

    updateMaterials(nextMaterials);
  }

  function renameMaterial(materialId: string, title: string) {
    const now = new Date().toISOString();
    const nextMaterials = latestWorkspaceRef.current.materials.map((material) =>
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
        : materialScope === "task" && selectedTask
          ? [{ taskId: selectedTask.id }]
          : selectedProject
            ? [{ projectId: selectedProject.id }]
            : [];
      const material: ProjectMaterial = {
        id: materialId,
        revision: 0,
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
    persistedWorkspaceRef.current = { projects: [], materials: [] };
    setProjects([]);
    setMaterials([]);
    setSelectedId("");
    setSelectedMaterialId("");
    setSelectedTaskId("");
    setSaveStatus("idle");
    setRemoteConflict(null);
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
      <div
        className={isProjectDrawerOpen ? "sidebar-shell open" : "sidebar-shell"}
        inert={isMobileLayout && !isProjectDrawerOpen}
      >
        <ProjectSidebar
          hasSession={Boolean(session)}
          query={query}
          statusFilter={statusFilter}
          searchResults={searchResults}
          projects={projects}
          filteredProjects={filteredProjects}
          selectedProject={selectedProject}
          onQueryChange={setQuery}
          onStatusFilterChange={setStatusFilter}
          onOpenSearchResult={openSearchResult}
          onOpenProject={openProject}
          onCreateProject={() => {
            closeProjectDrawer();
            openCreateForm();
          }}
          onOpenDigestSettings={() => {
            closeProjectDrawer();
            setIsDigestSettingsOpen(true);
          }}
          onSignOut={() => {
            closeProjectDrawer();
            void signOut();
          }}
          onClose={() => closeProjectDrawer(true)}
        />
      </div>

      {isMobileLayout && isProjectDrawerOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          onClick={() => closeProjectDrawer(true)}
          aria-label="Закрыть список проектов"
        />
      ) : null}

      <section
        className="project-view"
        aria-label="Обзор проекта"
        inert={isMobileLayout && isProjectDrawerOpen}
      >
        <button
          ref={mobileProjectButtonRef}
          className="mobile-project-button"
          type="button"
          onClick={() => setIsProjectDrawerOpen(true)}
          aria-expanded={isProjectDrawerOpen}
          aria-label="Открыть список проектов"
        >
          <span className="mobile-project-mark">{selectedProject?.icon ?? "L"}</span>
          <span className="mobile-project-copy">
            <small>Текущий проект</small>
            <strong>{selectedProject?.title ?? "Проекты"}</strong>
          </span>
          <Menu size={20} />
        </button>

        <div className={`save-status ${saveStatus}`}>
          {getSaveStatusLabel(saveStatus)}
        </div>

        {storageError ? (
          <div className={remoteConflict ? "storage-banner conflict" : "storage-banner"}>
            <span>{storageError}</span>
            {remoteConflict ? (
              <button className="text-button" type="button" onClick={acceptRemoteChanges}>
                Загрузить версию из другого окна
              </button>
            ) : null}
          </div>
        ) : null}

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
                <button
                  className="text-button primary"
                  type="button"
                  onClick={() => setIsAiAssistantOpen(true)}
                >
                  <Sparkles size={16} />
                  ИИ-ассистент
                </button>
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
                  onClick={() => openProjectSection(section)}
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
              <ProjectOverview project={selectedProject} />
            ) : null}

            {projectSection === "tasks" ? (
              <TaskSection
                project={selectedProject}
                selectedTask={selectedTask}
                selectedTaskId={selectedTaskId}
                taskItems={selectedTaskItems}
                subtasks={selectedTaskSubtasks}
                materials={selectedTaskMaterials}
                newTaskTitle={newTaskTitle}
                onNewTaskTitleChange={setNewTaskTitle}
                onSelectTask={openTask}
                onAddTask={addTask}
                onAddSubtask={addSubtask}
                onToggleTask={toggleTask}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                onMoveTask={moveTask}
                onAddMaterial={(project, taskId) => addMaterial(project, taskId)}
                onOpenMaterial={(materialId) => {
                  pushNavigationUrl({
                    section: "materials",
                    materialScope: "task",
                    materialId,
                  });
                  setProjectSection("materials");
                  setMaterialScope("task");
                  setSelectedMaterialId(materialId);
                }}
              />
            ) : null}

            {projectSection === "materials" ? (
              <MaterialsSection
                project={selectedProject}
                selectedTask={selectedTask}
                materialScope={materialScope}
                materials={contextualMaterials}
                selectedMaterial={selectedMaterial}
                isUploadingPdf={isUploadingPdf}
                onMaterialScopeChange={changeMaterialScope}
                onAddMaterial={addMaterial}
                onPdfSelected={handlePdfSelected}
                onSelectMaterial={openMaterial}
                onRenameMaterial={renameMaterial}
                onOpenLinks={openMaterialLinks}
                onDeleteMaterial={deleteMaterial}
                onUpdateMarkdown={updateMaterialMarkdown}
                onSaveMarkdown={saveMaterialMarkdown}
              />
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
        <MaterialLinksDialog
          material={linkingMaterial}
          projects={projects}
          expandedProjectIds={expandedMaterialLinkProjectIds}
          onToggleLink={toggleMaterialLink}
          onToggleProject={toggleMaterialLinkProject}
          onClose={() => setLinkingMaterialId("")}
        />
      ) : null}

      {isFormOpen ? (
        <ProjectFormDialog
          draft={draft}
          isEditing={Boolean(editingId)}
          onDraftChange={setDraft}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      ) : null}

      {isDigestSettingsOpen && session?.user.email ? (
        <DigestSettingsDialog
          accountEmail={session.user.email}
          onClose={() => setIsDigestSettingsOpen(false)}
        />
      ) : null}

      {isAiAssistantOpen && selectedProject ? (
        <AiAssistantDialog
          project={selectedProject}
          initialTaskId={selectedTaskId || undefined}
          onSave={saveAiMaterial}
          onClose={() => setIsAiAssistantOpen(false)}
        />
      ) : null}

    </main>
  );
}
