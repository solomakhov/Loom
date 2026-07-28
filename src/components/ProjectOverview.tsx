import { CalendarDays, Check, CirclePause, Clock3, ListChecks } from "lucide-react";
import { formatDate, isOverdue, priorityLabels, statusLabels } from "../projectModel";
import type { Project } from "../types";

export function ProjectOverview({ project }: { project: Project }) {
  return (
    <>
      <div className="overview-grid">
        <div className="metric">
          <span className={`metric-icon ${project.status}`}>
            {project.status === "done" ? <Check size={17} /> : <CirclePause size={17} />}
          </span>
          <div>
            <span className="label">Статус</span>
            <strong>{statusLabels[project.status]}</strong>
          </div>
        </div>
        <div className="metric">
          <span className="metric-icon">
            <Clock3 size={17} />
          </span>
          <div>
            <span className="label">Приоритет</span>
            <strong>{priorityLabels[project.priority]}</strong>
          </div>
        </div>
        <div className={isOverdue(project) ? "metric overdue" : "metric"}>
          <span className="metric-icon">
            <CalendarDays size={17} />
          </span>
          <div>
            <span className="label">Дедлайн</span>
            <strong>{formatDate(project.dueDate)}</strong>
          </div>
        </div>
        <div className="metric">
          <span className="metric-icon">
            <ListChecks size={17} />
          </span>
          <div>
            <span className="label">Задачи</span>
            <strong>{project.progress}%</strong>
          </div>
        </div>
      </div>

      <section className="section-block">
        <h3>Описание</h3>
        <p>{project.description || "Пока без описания."}</p>
      </section>

      <section className="section-block">
        <h3>Метки</h3>
        <div className="tag-row">
          {project.tags.length ? (
            project.tags.map((tag) => <span key={tag}>#{tag}</span>)
          ) : (
            <p>Метки не добавлены.</p>
          )}
        </div>
      </section>
    </>
  );
}
