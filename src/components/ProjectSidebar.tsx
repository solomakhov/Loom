import { Bell, Download, FileText, Filter, ListChecks, LogOut, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { formatDate, statusLabels, type WorkspaceSearchResult } from "../projectModel";
import {
  TASK_DRAG_TYPE,
  type Project,
  type ProjectStatus,
  type TaskDrag,
  type TaskDropTarget,
} from "../types";

type ProjectSidebarProps = {
  hasSession: boolean;
  query: string;
  statusFilter: ProjectStatus | "all";
  sortMode: "recent" | "title";
  searchResults: WorkspaceSearchResult[];
  projects: Project[];
  filteredProjects: Project[];
  selectedProject?: Project;
  draggedTask: TaskDrag | null;
  onDropTask: (target: TaskDropTarget) => void;
  onQueryChange: (query: string) => void;
  onStatusFilterChange: (status: ProjectStatus | "all") => void;
  onSortModeChange: (sortMode: "recent" | "title") => void;
  onOpenSearchResult: (result: WorkspaceSearchResult) => void;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenDigestSettings: () => void;
  onOpenBackup: () => void;
  onSignOut: () => void;
  onClose?: () => void;
};

export function ProjectSidebar({
  hasSession,
  query,
  statusFilter,
  sortMode,
  searchResults,
  projects,
  filteredProjects,
  selectedProject,
  draggedTask,
  onDropTask,
  onQueryChange,
  onStatusFilterChange,
  onSortModeChange,
  onOpenSearchResult,
  onOpenProject,
  onCreateProject,
  onOpenDigestSettings,
  onOpenBackup,
  onSignOut,
  onClose,
}: ProjectSidebarProps) {
  const [dropProject, setDropProject] = useState<{ projectId: string; drag: TaskDrag } | null>(null);

  return (
    <section className="sidebar" aria-label="Проекты">
      <div className="brand-row">
        <div>
          <p className="eyebrow">Loom</p>
          <h1>Проекты</h1>
        </div>
        <div className="sidebar-actions">
          {onClose ? (
            <button
              className="icon-button mobile-sidebar-close"
              type="button"
              onClick={onClose}
              aria-label="Закрыть список проектов"
            >
              <X size={18} />
            </button>
          ) : null}
          {hasSession ? (
            <>
              <button
                className="icon-button"
                type="button"
                onClick={onOpenBackup}
                title="Резервная копия"
              >
                <Download size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={onOpenDigestSettings}
                title="Ежедневная сводка"
              >
                <Bell size={17} />
              </button>
              <button className="icon-button" type="button" onClick={onSignOut} title="Выйти">
                <LogOut size={17} />
              </button>
            </>
          ) : null}
          <button
            className="icon-button primary sidebar-create-project"
            type="button"
            onClick={onCreateProject}
            title="Создать проект"
            aria-label="Создать проект"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <label className="search-box">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Название проекта, задача, материал"
          aria-label="Поиск по рабочему пространству"
        />
        {query ? (
          <button
            className="search-clear"
            type="button"
            onClick={() => onQueryChange("")}
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
                onClick={() => onOpenSearchResult(result)}
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
          <div className="project-list-toolbar">
            <div className="filter-row" aria-label="Фильтр по статусу">
              <Filter size={15} />
              {(["all", "active", "paused", "done"] as const).map((status) => (
                <button
                  key={status}
                  className={statusFilter === status ? "filter-pill active" : "filter-pill"}
                  type="button"
                  onClick={() => onStatusFilterChange(status)}
                >
                  {status === "all" ? "Все" : statusLabels[status]}
                </button>
              ))}
            </div>
            <label className="project-sort-control">
              <span>Сортировка</span>
              <select
                value={sortMode}
                onChange={(event) =>
                  onSortModeChange(event.target.value as "recent" | "title")
                }
              >
                <option value="recent">Недавние</option>
                <option value="title">По названию</option>
              </select>
            </label>
          </div>

          <div className="project-list">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                className={`project-row${selectedProject?.id === project.id ? " selected" : ""}${
                  draggedTask && dropProject?.drag === draggedTask && dropProject.projectId === project.id
                    ? " project-drop-target" : ""
                }`}
                type="button"
                onClick={() => onOpenProject(project.id)}
                onDragOver={(event) => {
                  if (draggedTask && draggedTask.projectId !== project.id && event.dataTransfer.types.includes(TASK_DRAG_TYPE)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dropProject?.projectId !== project.id || dropProject.drag !== draggedTask) {
                      setDropProject({ projectId: project.id, drag: draggedTask });
                    }
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDropProject(null);
                  }
                }}
                onDrop={(event) => {
                  if (draggedTask && draggedTask.projectId !== project.id && event.dataTransfer.types.includes(TASK_DRAG_TYPE)) {
                    event.preventDefault();
                    setDropProject(null);
                    onDropTask({ projectId: project.id });
                  }
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
        </>
      )}
    </section>
  );
}
