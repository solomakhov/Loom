import { ArchiveRestore, Download, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import type { WorkspaceData } from "../types";
import {
  createWorkspaceBackup,
  getWorkspaceBackupFileName,
  parseWorkspaceBackup,
  type ParsedWorkspaceBackup,
} from "../workspaceBackup";

type BackupDialogProps = {
  workspace: WorkspaceData;
  onRestore: (workspace: WorkspaceData) => Promise<void>;
  onClose: () => void;
};

export function BackupDialog({ workspace, onRestore, onClose }: BackupDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<ParsedWorkspaceBackup | null>(null);
  const [message, setMessage] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  function downloadBackup() {
    const backup = createWorkspaceBackup(workspace);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = getWorkspaceBackupFileName(backup.createdAt);
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Резервная копия сохранена на компьютер.");
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMessage("");
    setSelectedBackup(null);

    try {
      setSelectedBackup(parseWorkspaceBackup(await file.text()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось прочитать резервную копию.");
    } finally {
      event.target.value = "";
    }
  }

  async function restoreBackup() {
    if (!selectedBackup) {
      return;
    }

    if (
      !window.confirm(
        "Текущие проекты, задачи и материалы будут заменены данными из резервной копии. Продолжить?",
      )
    ) {
      return;
    }

    setIsRestoring(true);
    setMessage("");

    try {
      await onRestore(selectedBackup.workspace);
      setMessage("Резервная копия восстановлена.");
      setSelectedBackup(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось восстановить данные.");
    } finally {
      setIsRestoring(false);
    }
  }

  const pdfCount = workspace.materials.filter((material) => material.kind === "pdf").length;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isRestoring) {
          onClose();
        }
      }}
    >
      <section
        className="modal-panel backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">Локальная копия</p>
            <h2 id="backup-dialog-title">Резервное копирование</h2>
            <p>Проекты, задачи, связи и текстовые материалы в переносимом формате Loom.</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="backup-actions-grid">
          <article className="backup-action-card">
            <Download size={24} />
            <div>
              <h3>Создать копию</h3>
              <p>
                {workspace.projects.length} проектов, {workspace.materials.length} материалов.
              </p>
            </div>
            <button className="text-button primary" type="button" onClick={downloadBackup}>
              <Download size={16} />
              Скачать JSON
            </button>
          </article>

          <article className="backup-action-card">
            <Upload size={24} />
            <div>
              <h3>Восстановить</h3>
              <p>Сначала файл будет проверен, данные изменятся только после подтверждения.</p>
            </div>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={selectBackup}
            />
            <button
              className="text-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
            >
              <Upload size={16} />
              Выбрать файл
            </button>
          </article>
        </div>

        {selectedBackup ? (
          <div className="backup-preview">
            <ArchiveRestore size={22} />
            <div>
              <strong>
                {selectedBackup.workspace.projects.length} проектов ·{" "}
                {selectedBackup.workspace.materials.length} материалов
              </strong>
              <small>
                Создана {new Date(selectedBackup.backup.createdAt).toLocaleString("ru-RU")}
                {selectedBackup.wasLegacy ? " · старый формат будет обновлён" : ""}
              </small>
            </div>
            <button
              className="text-button primary"
              type="button"
              onClick={() => void restoreBackup()}
              disabled={isRestoring}
            >
              <ArchiveRestore size={16} />
              {isRestoring ? "Восстанавливаем..." : "Восстановить"}
            </button>
          </div>
        ) : null}

        <p className="backup-note">
          PDF-файлы хранятся отдельно в Supabase Storage и в JSON-копию базы не входят
          {pdfCount ? ` (${pdfCount} PDF сейчас)` : ""}. Их метаданные и связи сохраняются.
        </p>

        {message ? <p className="backup-message">{message}</p> : null}
      </section>
    </div>
  );
}
