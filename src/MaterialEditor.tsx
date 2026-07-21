type MaterialEditorProps = {
  materialId: string;
  markdown: string;
  onChange: (markdown: string) => void;
};

export function MaterialEditor({ materialId, markdown, onChange }: MaterialEditorProps) {
  return (
    <textarea
      key={materialId}
      className="material-markdown-textarea"
      value={markdown}
      onChange={(event) => onChange(event.target.value)}
      spellCheck
    />
  );
}
