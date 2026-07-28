import { Save, X } from "lucide-react";
import type { FormEvent } from "react";
import type { ProjectDraft, ProjectPriority, ProjectStatus } from "../types";

type ProjectFormDialogProps = {
  draft: ProjectDraft;
  isEditing: boolean;
  onDraftChange: (draft: ProjectDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ProjectFormDialog({
  draft,
  isEditing,
  onDraftChange,
  onClose,
  onSubmit,
}: ProjectFormDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="project-form" onSubmit={onSubmit}>
        <div className="form-header">
          <h2>{isEditing ? "Редактировать проект" : "Новый проект"}</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <label>
          Название
          <input
            required
            value={draft.title}
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
            placeholder="Например: Loom MVP"
          />
        </label>

        <label>
          Описание
          <textarea
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
            placeholder="Цель, контекст, ссылки, важные ограничения"
          />
        </label>

        <div className="form-grid">
          <label>
            Статус
            <select
              value={draft.status}
              onChange={(event) =>
                onDraftChange({ ...draft, status: event.target.value as ProjectStatus })
              }
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
              onChange={(event) =>
                onDraftChange({ ...draft, priority: event.target.value as ProjectPriority })
              }
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
              onChange={(event) => onDraftChange({ ...draft, startDate: event.target.value })}
            />
          </label>

          <label>
            Дедлайн
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) => onDraftChange({ ...draft, dueDate: event.target.value })}
            />
          </label>
        </div>

        <div className="form-grid compact">
          <label>
            Метка проекта
            <input
              maxLength={2}
              value={draft.icon}
              onChange={(event) => onDraftChange({ ...draft, icon: event.target.value })}
              placeholder="L"
            />
          </label>
          <label>
            Теги
            <input
              value={draft.tagsInput}
              onChange={(event) => onDraftChange({ ...draft, tagsInput: event.target.value })}
              placeholder="разработка, дом, отпуск"
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="text-button" type="button" onClick={onClose}>
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
  );
}
