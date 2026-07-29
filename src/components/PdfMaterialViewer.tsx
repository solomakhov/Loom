import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { formatFileSize, getErrorMessage } from "../projectModel";
import { getMaterialFileUrl } from "../storage";
import type { ProjectMaterial } from "../types";

export function PdfMaterialViewer({ material }: { material: ProjectMaterial }) {
  const [fileUrl, setFileUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    let isMounted = true;
    let objectUrl = "";
    const abortController = new AbortController();

    if (!material.filePath) {
      setFileError("У PDF не указан путь к файлу.");
      return;
    }

    setFileUrl("");
    setPreviewUrl("");
    setFileError("");
    getMaterialFileUrl(material.filePath)
      .then(async (url) => {
        const response = await fetch(url, { signal: abortController.signal });

        if (!response.ok) {
          throw new Error(`сервер вернул ${response.status}`);
        }

        const pdfBlob = await response.blob();
        objectUrl = URL.createObjectURL(
          pdfBlob.type === "application/pdf"
            ? pdfBlob
            : new Blob([pdfBlob], { type: "application/pdf" }),
        );

        if (isMounted) {
          setFileUrl(url);
          setPreviewUrl(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (isMounted) {
          setFileError(`Не удалось открыть PDF: ${getErrorMessage(error)}`);
        }
      });

    return () => {
      isMounted = false;
      abortController.abort();

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [material.filePath]);

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
      {fileError ? <p className="material-file-error">{fileError}</p> : null}
      {!fileError && !previewUrl ? <p className="muted">Загружаем PDF для просмотра...</p> : null}
      {previewUrl ? (
        <iframe
          className="pdf-frame"
          src={`${previewUrl}#view=FitH`}
          title={material.title.trim() || material.fileName || "PDF"}
        />
      ) : null}
    </div>
  );
}
