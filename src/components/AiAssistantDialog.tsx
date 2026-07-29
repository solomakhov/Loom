import { Save, Search, Sparkles, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  generateMaterialDraft,
  type AiMaterialDraft,
} from "../aiAssistant";
import { getErrorMessage, getTaskTreeItems } from "../projectModel";
import type { Project } from "../types";

type AiAssistantDialogProps = {
  project: Project;
  initialTaskId?: string;
  onSave: (draft: AiMaterialDraft, taskId?: string) => void;
  onClose: () => void;
};

export function AiAssistantDialog({
  project,
  initialTaskId,
  onSave,
  onClose,
}: AiAssistantDialogProps) {
  const [taskId, setTaskId] = useState(initialTaskId ?? "");
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<AiMaterialDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const taskItems = getTaskTreeItems(project.tasks);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setMessage("");
    setDraft(null);

    try {
      const generatedDraft = await generateMaterialDraft({
        projectId: project.id,
        taskId: taskId || undefined,
        prompt,
      });
      setDraft(generatedDraft);
    } catch (error) {
      setMessage(`Не удалось подготовить материал: ${getErrorMessage(error)}`);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isGenerating) {
          onClose();
        }
      }}
    >
      <form
        className="modal-panel ai-assistant-dialog"
        onSubmit={handleGenerate}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">Ограниченный ИИ-ассистент</p>
            <h2 id="ai-assistant-title">Подготовить материал</h2>
            <p>
              ИИ создаст только черновик. Ничего не сохранится без твоего подтверждения.
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="ai-context-grid">
          <label>
            Проект
            <input value={project.title} disabled />
          </label>
          <label>
            Куда сохранить
            <select
              value={taskId}
              onChange={(event) => {
                setTaskId(event.target.value);
                setDraft(null);
              }}
              disabled={isGenerating}
            >
              <option value="">К проекту</option>
              {taskItems.map(({ task, depth }) => (
                <option key={task.id} value={task.id}>
                  {`${"— ".repeat(depth)}${task.title}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="ai-prompt-field">
          Что нужно собрать
          <textarea
            required
            minLength={10}
            maxLength={1500}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setDraft(null);
            }}
            disabled={isGenerating}
            placeholder="Например: собери информацию по главным достопримечательностям Кутаиси, кратко опиши каждую и добавь практические советы."
          />
          <small>{prompt.length}/1500</small>
        </label>

        {isGenerating ? (
          <div className="ai-progress" role="status">
            <Sparkles size={18} />
            Ищем информацию и готовим черновик. Это может занять около минуты…
          </div>
        ) : null}

        {message ? <p className="auth-message">{message}</p> : null}

        {draft ? (
          <section className="ai-draft-preview" aria-label="Предпросмотр материала">
            <div className="ai-preview-heading">
              <div>
                <p className="eyebrow">Предпросмотр</p>
                <h3>Проверь и при необходимости отредактируй</h3>
              </div>
              <span>Осталось запросов: {draft.remaining}</span>
            </div>

            <label>
              Название
              <input
                value={draft.title}
                maxLength={140}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>

            <label>
              Текст Markdown
              <textarea
                className="ai-markdown-preview"
                value={draft.markdown}
                onChange={(event) => setDraft({ ...draft, markdown: event.target.value })}
              />
            </label>

            {draft.sources.length ? (
              <div className="ai-sources">
                <strong>Источники</strong>
                <ul>
                  {draft.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">Веб-источники для этого ответа не использовались.</p>
            )}
          </section>
        ) : null}

        <p className="ai-disclaimer">
          ИИ может ошибаться. Проверь факты и источники перед сохранением.
        </p>

        <div className="form-actions">
          <button
            className="text-button"
            type="button"
            onClick={onClose}
            disabled={isGenerating}
          >
            Отмена
          </button>
          {draft ? (
            <>
              <button
                className="text-button"
                type="submit"
                disabled={isGenerating || prompt.trim().length < 10}
              >
                <Search size={16} />
                Собрать заново
              </button>
              <button
                className="text-button primary"
                type="button"
                disabled={!draft.title.trim() || !draft.markdown.trim()}
                onClick={() => onSave(draft, taskId || undefined)}
              >
                <Save size={16} />
                Сохранить материал
              </button>
            </>
          ) : (
            <button
              className="text-button primary"
              type="submit"
              disabled={isGenerating || prompt.trim().length < 10}
            >
              <Search size={16} />
              {isGenerating ? "Собираем…" : "Собрать материал"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

