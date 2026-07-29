import { FileText, FileUp, Link2, Plus, Trash2 } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { MaterialEditor } from "../MaterialEditor";
import { formatFileSize, type MaterialScope } from "../projectModel";
import type { Project, ProjectMaterial, ProjectTask } from "../types";
import { MaterialErrorBoundary } from "./ErrorBoundaries";
import { PdfMaterialViewer } from "./PdfMaterialViewer";

type MaterialsSectionProps = {
  project: Project;
  selectedTask?: ProjectTask;
  materialScope: MaterialScope;
  materials: ProjectMaterial[];
  selectedMaterial?: ProjectMaterial;
  isUploadingPdf: boolean;
  onMaterialScopeChange: (scope: MaterialScope) => void;
  onAddMaterial: (project?: Project, taskId?: string) => void;
  onPdfSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectMaterial: (materialId: string) => void;
  onRenameMaterial: (materialId: string, title: string) => void;
  onOpenLinks: (material: ProjectMaterial) => void;
  onDeleteMaterial: (materialId: string) => void;
  onUpdateMarkdown: (materialId: string, markdown: string) => void;
};

export function MaterialsSection({
  project,
  selectedTask,
  materialScope,
  materials,
  selectedMaterial,
  isUploadingPdf,
  onMaterialScopeChange,
  onAddMaterial,
  onPdfSelected,
  onSelectMaterial,
  onRenameMaterial,
  onOpenLinks,
  onDeleteMaterial,
  onUpdateMarkdown,
}: MaterialsSectionProps) {
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const addContextMaterial = () =>
    onAddMaterial(
      materialScope === "all" ? undefined : project,
      materialScope === "task" ? selectedTask?.id : undefined,
    );

  return (
    <section className="section-block materials-section">
      <div className="section-title-row">
        <div>
          <h3>
            {materialScope === "task" && selectedTask
              ? "Материалы задачи"
              : materialScope === "project"
                ? "Материалы проекта"
                : "Все материалы"}
          </h3>
          <p>
            {materialScope === "all"
              ? "Все документы и PDF, включая материалы без связей."
              : materialScope === "task" && selectedTask
                ? `Только материалы задачи «${selectedTask.title}».`
                : "Материалы проекта и всех его задач."}
          </p>
        </div>
        <div className="material-section-actions">
          <div className="segmented-control" aria-label="Область материалов">
            {selectedTask ? (
              <button
                className={materialScope === "task" ? "selected" : ""}
                type="button"
                onClick={() => onMaterialScopeChange("task")}
              >
                Задача
              </button>
            ) : null}
            <button
              className={materialScope === "project" ? "selected" : ""}
              type="button"
              onClick={() => onMaterialScopeChange("project")}
            >
              Проект
            </button>
            <button
              className={materialScope === "all" ? "selected" : ""}
              type="button"
              onClick={() => onMaterialScopeChange("all")}
            >
              Все
            </button>
          </div>
          <button className="text-button" type="button" onClick={addContextMaterial}>
            <Plus size={16} />
            Документ
          </button>
          <button
            className="text-button primary"
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={isUploadingPdf}
          >
            <FileUp size={16} />
            {isUploadingPdf ? "Загрузка..." : "PDF"}
          </button>
          <input
            ref={pdfInputRef}
            className="visually-hidden"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPdfSelected}
          />
        </div>
      </div>

      <div className="materials-layout">
        <div className="material-list" aria-label="Материалы">
          {materials.length ? (
            materials.map((material) => (
              <button
                className={
                  selectedMaterial?.id === material.id ? "material-row selected" : "material-row"
                }
                key={material.id}
                type="button"
                onClick={() => onSelectMaterial(material.id)}
              >
                {material.kind === "pdf" ? <FileUp size={16} /> : <FileText size={16} />}
                <span className="material-row-copy">
                  <span>{material.title.trim() || material.fileName || "Без названия"}</span>
                  <small>
                    {materialScope === "all"
                      ? material.links.length
                        ? `${material.links.length} связ.`
                        : "Без связей"
                      : material.kind === "pdf"
                        ? `PDF${material.fileSize ? ` · ${formatFileSize(material.fileSize)}` : ""}`
                        : "Документ"}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="muted">
              {materialScope === "all"
                ? "Пока нет материалов."
                : materialScope === "task" && selectedTask
                  ? "К этой задаче материалы не привязаны."
                  : "У проекта и его задач пока нет материалов."}
            </p>
          )}
        </div>

        <div className="material-editor-panel">
          {selectedMaterial ? (
            <>
              <div className="material-title-row">
                <input
                  value={selectedMaterial.title}
                  onChange={(event) =>
                    onRenameMaterial(selectedMaterial.id, event.target.value)
                  }
                  aria-label="Название материала"
                  placeholder="Без названия"
                />
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => onOpenLinks(selectedMaterial)}
                  title="Изменить связи"
                >
                  <Link2 size={16} />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => onDeleteMaterial(selectedMaterial.id)}
                  title="Удалить материал"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <button
                className="material-link-summary"
                type="button"
                onClick={() => onOpenLinks(selectedMaterial)}
              >
                <Link2 size={15} />
                {selectedMaterial.links.length
                  ? `Связи: ${selectedMaterial.links.length}`
                  : "Материал без связей"}
              </button>
              <MaterialErrorBoundary
                key={selectedMaterial.id}
                onClose={() => onSelectMaterial("")}
              >
                {selectedMaterial.kind === "pdf" ? (
                  <PdfMaterialViewer material={selectedMaterial} />
                ) : (
                  <MaterialEditor
                    markdown={selectedMaterial.markdown}
                    onChange={(markdown) => onUpdateMarkdown(selectedMaterial.id, markdown)}
                  />
                )}
              </MaterialErrorBoundary>
            </>
          ) : (
            <div className="material-empty">
              {materials.length ? (
                <>
                  <h3>Выберите материал</h3>
                  <p>Откройте документ или PDF из списка слева.</p>
                </>
              ) : (
                <>
                  <h3>Здесь пока пусто</h3>
                  <p>
                    Создай документ или загрузи PDF. Связи с проектами и задачами можно изменить
                    позже.
                  </p>
                  <button
                    className="text-button primary"
                    type="button"
                    onClick={addContextMaterial}
                  >
                    <Plus size={16} />
                    Новый документ
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
