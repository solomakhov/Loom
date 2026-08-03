import { Bell, Download, FileText, Filter, ListChecks, LogOut, Plus, Search, X } from "lucide-react";
import { formatDate, statusLabels, type WorkspaceSearchResult } from "../projectModel";
import type { Project, ProjectStatus } from "../types";

type ProjectSidebarProps = {
  hasSession: boolean;
  query: string;
  statusFilter: ProjectStatus | "all";
  sortMode: "recent" | "title";
  searchResults: WorkspaceSearchResult[];
  projects: Project[];
  filteredProjects: Project[];
  selectedProject?: Project;
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
            className="icon-button primary"
            type="button"
            onClick={onCreateProject}
            title="Создать проект"
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
                className={
                  selectedProject?.id === project.id ? "project-row selected" : "project-row"
                }
                type="button"
                onClick={() => onOpenProject(project.id)}
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
