import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { formatFileSize, getErrorMessage } from "../projectModel";
import { getMaterialFileUrl } from "../storage";
import type { ProjectMaterial } from "../types";

export function PdfMaterialViewer({ material }: { material: ProjectMaterial }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    let isMounted = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let loadedDocument: PDFDocumentProxy | undefined;
    const abortController = new AbortController();

    setFileUrl("");
    setPdfDocument(null);
    setPageNumber(1);
    setPageCount(0);
    setFileError("");

    if (!material.filePath) {
      setFileError("У PDF не указан путь к файлу.");
      return;
    }

    setIsLoading(true);
    getMaterialFileUrl(material.filePath)
      .then(async (url) => {
        if (isMounted) {
          setFileUrl(url);
        }

        const response = await fetch(url, { signal: abortController.signal });

        if (!response.ok) {
          throw new Error(`сервер вернул ${response.status}`);
        }

        const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = getDocument({
          data: await response.arrayBuffer(),
        });
        loadedDocument = await loadingTask.promise;

        if (isMounted) {
          setPdfDocument(loadedDocument);
          setPageCount(loadedDocument.numPages);
          setIsLoading(false);
        } else {
          await loadedDocument.destroy();
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (isMounted) {
          setFileError(`Не удалось открыть PDF: ${getErrorMessage(error)}`);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      abortController.abort();
      void loadingTask?.destroy();
    };
  }, [material.filePath]);

  useEffect(() => {
    let renderTask: RenderTask | undefined;
    let isCancelled = false;

    if (!pdfDocument || !canvasRef.current) {
      return;
    }

    setIsLoading(true);
    pdfDocument
      .getPage(pageNumber)
      .then((page) => {
        if (isCancelled || !canvasRef.current) {
          return;
        }

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("браузер не поддерживает Canvas 2D");
        }

        const viewport = page.getViewport({ scale });
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });

        return renderTask.promise;
      })
      .then(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      })
      .catch((error) => {
        if (!isCancelled && error?.name !== "RenderingCancelledException") {
          setFileError(`Не удалось отобразить страницу PDF: ${getErrorMessage(error)}`);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdfDocument, scale]);

  return (
    <div className="pdf-material">
      <div className="pdf-material-meta">
        <span>{material.fileName || "PDF-документ"}</span>
        <span>{formatFileSize(material.fileSize)}</span>
        {fileUrl ? (
          <a
            className="text-button"
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            download={material.fileName || true}
          >
            <Download size={15} />
            Скачать
          </a>
        ) : null}
      </div>

      {pdfDocument ? (
        <div className="pdf-viewer-toolbar" aria-label="Управление просмотром PDF">
          <button
            className="icon-button"
            type="button"
            title="Предыдущая страница"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            Страница {pageNumber} из {pageCount}
          </span>
          <button
            className="icon-button"
            type="button"
            title="Следующая страница"
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
          >
            <ChevronRight size={17} />
          </button>
          <span className="pdf-viewer-spacer" />
          <button
            className="icon-button"
            type="button"
            title="Уменьшить"
            disabled={scale <= 0.6}
            onClick={() => setScale((current) => Math.max(0.6, current - 0.2))}
          >
            <ZoomOut size={17} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            className="icon-button"
            type="button"
            title="Увеличить"
            disabled={scale >= 2.2}
            onClick={() => setScale((current) => Math.min(2.2, current + 0.2))}
          >
            <ZoomIn size={17} />
          </button>
        </div>
      ) : null}

      {fileError ? <p className="material-file-error">{fileError}</p> : null}
      {!fileError && isLoading && !pdfDocument ? (
        <p className="muted">Загружаем PDF для просмотра...</p>
      ) : null}
      {pdfDocument ? (
        <div className="pdf-canvas-stage" aria-busy={isLoading}>
          <canvas ref={canvasRef} className="pdf-page-canvas" />
          {isLoading ? <span className="pdf-rendering-status">Отрисовываем страницу…</span> : null}
        </div>
      ) : null}
    </div>
  );
}
