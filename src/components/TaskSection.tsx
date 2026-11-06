import { ArrowDown, ArrowUp, FileUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { useState, type DragEvent } from "react";
import { MaterialPreview } from "../MaterialEditor";
import { formatFileSize, type TaskTreeItem } from "../projectModel";
import {
  TASK_DRAG_TYPE,
  type Project,
  type ProjectMaterial,
  type ProjectTask,
  type TaskDrag,
  type TaskDropTarget,
} from "../types";

type TaskSectionProps = {
  project: Project;
  selectedTask?: ProjectTask;
  selectedTaskId: string;
  taskItems: TaskTreeItem[];
  subtasks: ProjectTask[];
  materials: ProjectMaterial[];
  newTaskTitle: string;
  onNewTaskTitleChange: (title: string) => void;
  onSelectTask: (taskId: string) => void;
  onAddTask: (project: Project, title: string, parentTaskId?: string) => void;
  onAddSubtask: (project: Project, parentTaskId: string) => void;
  onToggleTask: (project: Project, taskId: string) => void;
  onUpdateTask: (
    project: Project,
    taskId: string,
    updates: Partial<ProjectTask>,
    options?: { debounce?: boolean },
  ) => void;
  onDeleteTask: (project: Project, taskId: string) => void;
  onMoveTask: (project: Project, taskId: string, direction: -1 | 1) => void;
  draggedTask: TaskDrag | null;
  onDragTask?: (drag: TaskDrag | null) => void;
  onDropTask: (target: TaskDropTarget) => void;
  onAddMaterial: (project: Project, taskId: string) => void;
  onOpenMaterial: (materialId: string) => void;
};

export function TaskSection({
  project,
  selectedTask,
  selectedTaskId,
  taskItems,
  subtasks,
  materials,
  newTaskTitle,
  onNewTaskTitleChange,
  onSelectTask,
  onAddTask,
  onAddSubtask,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  draggedTask,
  onDragTask,
  onDropTask,
  onAddMaterial,
  onOpenMaterial,
}: TaskSectionProps) {
  const [dropTarget, setDropTarget] = useState<{ taskId: string; after: boolean } | null>(null);
  let indicatorId = dropTarget?.taskId;
  if (dropTarget?.after) {
    const index = taskItems.findIndex(({ task }) => task.id === dropTarget.taskId);
    if (index !== -1) {
      const depth = taskItems[index].depth;
      for (let child = index + 1; child < taskItems.length && taskItems[child].depth > depth; child += 1) {
        indicatorId = taskItems[child].task.id;
      }
    }
  }

  function getDropTarget(event: DragEvent<HTMLDivElement>, task: ProjectTask) {
    if (
      !onDragTask ||
      !event.dataTransfer.types.includes(TASK_DRAG_TYPE) ||
      draggedTask?.projectId !== project.id ||
      draggedTask.taskId === task.id ||
      draggedTask.parentTaskId !== task.parentTaskId
    ) {
      return;
    }

    const row = event.currentTarget.getBoundingClientRect();
    return { taskId: task.id, after: event.clientY >= row.top + row.height / 2 };
  }

  return (
    <section className="section-block tasks-section">
      <div className="section-title-row">
        <div>
          <h3>Задачи</h3>
          <p>
            {project.tasks.filter((task) => task.done).length} из {project.tasks.length} выполнено
          </p>
        </div>
        <strong>{project.progress}%</strong>
      </div>

      <div className="progress-track" aria-label="Прогресс задач">
        <span style={{ width: `${project.progress}%` }} />
      </div>

      <form
        className="task-form"
        onSubmit={(event) => {
          event.preventDefault();
          onAddTask(project, newTaskTitle);
        }}
      >
        <input
          value={newTaskTitle}
          onChange={(event) => onNewTaskTitleChange(event.target.value)}
          placeholder="Добавить пункт плана"
        />
        <button className="icon-button primary" type="submit" title="Добавить задачу">
          <Plus size={17} />
        </button>
      </form>

      <div className="task-list">
        {project.tasks.length ? (
          taskItems.map(({ task, depth, siblingIndex, siblingCount }) => (
            <div
              className={[
                "task-row",
                task.done ? "done" : "",
                selectedTaskId === task.id ? "selected" : "",
                draggedTask?.taskId === task.id ? "task-dragging" : "",
                draggedTask && indicatorId === task.id
                  ? dropTarget?.after ? "task-drop-after" : "task-drop-before"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={task.id}
              data-task-id={task.id}
              onClick={() => onSelectTask(task.id)}
              onDragOver={(event) => {
                const target = getDropTarget(event, task);
                if (target) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (target.taskId !== dropTarget?.taskId || target.after !== dropTarget.after) {
                    setDropTarget(target);
                  }
                }
              }}
              onDragLeave={(event) => {
                if (dropTarget?.taskId === task.id && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget(null);
                }
              }}
              onDrop={(event) => {
                const target = getDropTarget(event, task);
                if (target) {
                  event.preventDefault();
                  setDropTarget(null);
                  onDropTask({ projectId: project.id, ...target });
                }
              }}
              style={{ marginLeft: depth ? `${depth * 20}px` : undefined }}
            >
              <div className="task-row-main">
                {onDragTask ? (
                  <span
                    className="task-drag-handle"
                    draggable
                    title="Перетащить задачу. Можно перенести на другой проект в боковой панели."
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
                      onDragTask({ projectId: project.id, taskId: task.id, parentTaskId: task.parentTaskId });
                    }}
                    onDragEnd={() => {
                      setDropTarget(null);
                      onDragTask(null);
                    }}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                  </span>
                ) : null}
                <input
                  checked={task.done}
                  type="checkbox"
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onToggleTask(project, task.id)}
                />
                <span>{task.title}</span>
              </div>
              <div className="task-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoveTask(project, task.id, -1);
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
                    onMoveTask(project, task.id, 1);
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
                    onAddSubtask(project, task.id);
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
                    onDeleteTask(project, task.id);
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
              onClick={() => onSelectTask("")}
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
                  onUpdateTask(
                    project,
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
                  onUpdateTask(project, selectedTask.id, {
                    done: event.target.value === "done",
                  })
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
                  onUpdateTask(project, selectedTask.id, { startDate: event.target.value })
                }
              />
            </label>
            <label>
              Срок
              <input
                type="date"
                value={selectedTask.dueDate ?? ""}
                onChange={(event) =>
                  onUpdateTask(project, selectedTask.id, { dueDate: event.target.value })
                }
              />
            </label>
          </div>

          <label className="task-description-field">
            Описание
            <textarea
              value={selectedTask.description ?? ""}
              onChange={(event) =>
                onUpdateTask(
                  project,
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
                  onClick={() => onAddSubtask(project, selectedTask.id)}
                >
                  <Plus size={15} />
                  Подзадача
                </button>
              </div>
              <div className="compact-list">
                {subtasks.length ? (
                  subtasks.map((task) => (
                    <button
                      className="compact-row"
                      key={task.id}
                      type="button"
                      onClick={() => onSelectTask(task.id)}
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
                  onClick={() => onAddMaterial(project, selectedTask.id)}
                >
                  <Plus size={15} />
                  Материал
                </button>
              </div>
              <div className="linked-material-list">
                {materials.length ? (
                  materials.map((material) => (
                    <details className="linked-material" key={material.id}>
                      <summary>
                        <span>
                          {material.title.trim() || material.fileName || "Без названия"}
                        </span>
                        <button
                          className="text-button"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            onOpenMaterial(material.id);
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
                        <MaterialPreview markdown={material.markdown} />
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
      ) : project.tasks.length ? (
        <div className="task-detail-empty">
          <p>Выбери задачу в списке, чтобы открыть сроки, описание, подзадачи и материалы.</p>
        </div>
      ) : null}
    </section>
  );
}
