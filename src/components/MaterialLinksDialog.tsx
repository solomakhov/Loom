import { ChevronDown, ChevronRight, X } from "lucide-react";
import { getTaskTreeItems } from "../projectModel";
import type { MaterialLink, Project, ProjectMaterial } from "../types";

type MaterialLinksDialogProps = {
  material: ProjectMaterial;
  projects: Project[];
  expandedProjectIds: Set<string>;
  onToggleLink: (materialId: string, link: MaterialLink) => void;
  onToggleProject: (projectId: string) => void;
  onClose: () => void;
};

export function MaterialLinksDialog({
  material,
  projects,
  expandedProjectIds,
  onToggleLink,
  onToggleProject,
  onClose,
}: MaterialLinksDialogProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
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
            <p>{material.title.trim() || material.fileName || "Без названия"}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="material-link-targets">
          {projects.map((project) => {
            const isExpanded = expandedProjectIds.has(project.id);
            const taskItems = getTaskTreeItems(project.tasks);

            return (
              <div className="material-link-project" key={project.id}>
                <div className="project-link-row">
                  <label className="material-link-option project-link-option">
                    <input
                      type="checkbox"
                      checked={material.links.some((link) => link.projectId === project.id)}
                      onChange={() => onToggleLink(material.id, { projectId: project.id })}
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
                      onClick={() => onToggleProject(project.id)}
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
                          checked={material.links.some((link) => link.taskId === task.id)}
                          onChange={() => onToggleLink(material.id, { taskId: task.id })}
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
            {material.links.length
              ? `Выбрано связей: ${material.links.length}`
              : "Материал останется свободным"}
          </span>
          <button className="text-button primary" type="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </section>
    </div>
  );
}
