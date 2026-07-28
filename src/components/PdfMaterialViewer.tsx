import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { formatFileSize, getErrorMessage } from "../projectModel";
import { getMaterialFileUrl } from "../storage";
import type { ProjectMaterial } from "../types";

export function PdfMaterialViewer({ material }: { material: ProjectMaterial }) {
  const [fileUrl, setFileUrl] = useState("");
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (!material.filePath) {
      setFileError("У PDF не указан путь к файлу.");
      return;
    }

    setFileUrl("");
    setFileError("");
    getMaterialFileUrl(material.filePath)
      .then((url) => {
        if (isMounted) {
          setFileUrl(url);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setFileError(`Не удалось открыть PDF: ${getErrorMessage(error)}`);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [material.filePath]);

  return (
    <div className="pdf-material">
      <div className="pdf-material-meta">
        <span>{material.fileName || "PDF-документ"}</span>
        <span>{formatFileSize(material.fileSize)}</span>
        {fileUrl ? (
          <a className="text-button" href={fileUrl} target="_blank" rel="noreferrer">
            <Download size={15} />
            Скачать
          </a>
        ) : null}
      </div>
      {fileError ? <p className="material-file-error">{fileError}</p> : null}
      {!fileError && !fileUrl ? <p className="muted">Открываем PDF...</p> : null}
      {fileUrl ? (
        <iframe
          className="pdf-frame"
          src={fileUrl}
          title={material.title.trim() || material.fileName || "PDF"}
        />
      ) : null}
    </div>
  );
}
