import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Archive,
  Edit3,
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
  saveWorkspace,
  uploadPdfFile,
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

export function App() {
  const saveTimerRef = useRef<number | null>(null);
  const pendingMaterialNavigationRef = useRef<{ id: string; scope: MaterialScope } | null>(
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
        const savedNavigation = loadSavedNavigation(session?.user.id);
        const restoredProject =
          loadedWorkspace.projects.find((project) => project.id === savedNavigation?.projectId) ??
          loadedWorkspace.projects[0];
        const restoredTask = restoredProject?.tasks.find(
          (task) => task.id === savedNavigation?.taskId,
        );
        const restoredScope =
          savedNavigation?.materialScope === "task" && !restoredTask
            ? "project"
            : savedNavigation?.materialScope ?? "project";
        const restoredMaterialId = loadedWorkspace.materials.some(
          (material) => material.id === savedNavigation?.materialId,
        )
          ? savedNavigation?.materialId ?? ""
          : "";

        if (savedNavigation?.section === "materials") {
          pendingMaterialNavigationRef.current = {
            id: restoredMaterialId,
            scope: restoredScope,
          };
        }

        setSelectedId(restoredProject?.id ?? "");
        setSelectedTaskId(restoredTask?.id ?? "");
        setProjectSection(savedNavigation?.section ?? "tasks");
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
    setSelectedId(projectId);
    setSelectedMaterialId("");
    setSelectedTaskId("");
    setProjectSection(section);
  }

  function changeMaterialScope(scope: MaterialScope) {
    setMaterialScope(scope);
    setSelectedMaterialId("");
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
        : materialScope === "task" && selectedTask
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
        onCreateProject={openCreateForm}
        onOpenDigestSettings={() => setIsDigestSettingsOpen(true)}
        onSignOut={signOut}
      />

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
                  onClick={() => {
                    if (section === "materials") {
                      changeMaterialScope("project");
                    }

                    setProjectSection(section);
                  }}
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
                onSelectTask={setSelectedTaskId}
                onAddTask={addTask}
                onAddSubtask={addSubtask}
                onToggleTask={toggleTask}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                onMoveTask={moveTask}
                onAddMaterial={(project, taskId) => addMaterial(project, taskId)}
                onOpenMaterial={(materialId) => {
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
                onSelectMaterial={setSelectedMaterialId}
                onRenameMaterial={renameMaterial}
                onOpenLinks={openMaterialLinks}
                onDeleteMaterial={deleteMaterial}
                onUpdateMarkdown={updateMaterialMarkdown}
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
