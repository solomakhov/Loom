import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps,
  type MDXEditorMethods,
  UndoRedo,
  activeEditor$,
  codeBlockPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  useCodeBlockEditorContext,
} from "@mdxeditor/editor";
import { useCellValue } from "@mdxeditor/gurx";
import { $patchStyleText } from "@lexical/selection";
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type RangeSelection,
} from "lexical";
import { type ClipboardEvent, useEffect, useRef, useState } from "react";

type MaterialEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  onSave: (markdown: string) => void;
};

type MaterialPreviewProps = {
  markdown: string;
};

type MarkdownProcessingError = {
  error: string;
  source: string;
};

function PlainCodeBlockEditor({
  code,
  language,
  focusEmitter,
}: CodeBlockEditorProps) {
  const { setCode, setLanguage } = useCodeBlockEditorContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    focusEmitter.subscribe(() => textareaRef.current?.focus());
  }, [focusEmitter]);

  return (
    <div className="material-code-block">
      <input
        aria-label="Язык блока кода"
        value={language}
        placeholder="Язык"
        onChange={(event) => setLanguage(event.target.value)}
      />
      <textarea
        ref={textareaRef}
        aria-label="Содержимое блока кода"
        value={code}
        spellCheck={false}
        onChange={(event) => setCode(event.target.value)}
      />
    </div>
  );
}

const plainCodeBlockDescriptor: CodeBlockEditorDescriptor = {
  priority: 0,
  match: () => true,
  Editor: PlainCodeBlockEditor,
};

function looksLikeMarkdown(value: string) {
  return (
    /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~|---\s*$)/m.test(value) ||
    /(^|\n)\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(value) ||
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/.test(value)
  );
}

function containsExecutableHtml(value: string) {
  return (
    /<!doctype\b/i.test(value) ||
    /<\s*\/?\s*(?:script|iframe|object|embed|link|meta|base|html|head|body)\b/i.test(value)
  );
}

function TextColorControls() {
  const activeEditor = useCellValue(activeEditor$);
  const savedSelection = useRef<RangeSelection | null>(null);
  const [textColor, setTextColor] = useState("#263a32");
  const [backgroundColor, setBackgroundColor] = useState("#fff1a8");

  function rememberSelection() {
    activeEditor?.getEditorState().read(() => {
      const selection = $getSelection();
      savedSelection.current = $isRangeSelection(selection) ? selection.clone() : null;
    });
  }

  function applyColors(styles: Record<string, string>) {
    activeEditor?.update(() => {
      const currentSelection = $getSelection();
      const selection = $isRangeSelection(currentSelection)
        ? currentSelection
        : savedSelection.current;

      if (!selection) {
        return;
      }

      if (!$isRangeSelection(currentSelection)) {
        $setSelection(selection.clone());
      }

      $patchStyleText(selection, styles);
    });
  }

  return (
    <div className="material-color-controls" onPointerDown={rememberSelection}>
      <label title="Цвет текста">
        <span className="material-color-letter">A</span>
        <input
          aria-label="Цвет текста"
          type="color"
          value={textColor}
          onChange={(event) => {
            setTextColor(event.target.value);
            applyColors({ color: event.target.value });
          }}
        />
      </label>
      <label title="Цвет фона текста">
        <span className="material-color-highlight">A</span>
        <input
          aria-label="Цвет фона текста"
          type="color"
          value={backgroundColor}
          onChange={(event) => {
            setBackgroundColor(event.target.value);
            applyColors({ "background-color": event.target.value });
          }}
        />
      </label>
      <button
        className="material-color-reset"
        type="button"
        title="Убрать цвет текста и фона"
        onClick={() => applyColors({ color: "", "background-color": "" })}
      >
        ×
      </button>
    </div>
  );
}

export function MaterialEditor({ markdown, onChange, onSave }: MaterialEditorProps) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const [markdownError, setMarkdownError] = useState<MarkdownProcessingError | null>(null);

  useEffect(() => {
    const editor = editorRef.current;

    if (editor && editor.getMarkdown() !== markdown) {
      editor.setMarkdown(markdown);
    }
  }, [markdown]);

  useEffect(() => {
    if (markdownError && markdown !== markdownError.source) {
      setMarkdownError(null);
    }
  }, [markdown, markdownError]);

  const sourceMarkdown = markdownError?.source ?? markdown;

  if (containsExecutableHtml(markdown) || markdownError) {
    return (
      <div className="material-source-mode">
        <p>
          {markdownError
            ? "Фрагмент содержит разметку, которую визуальный редактор не смог распознать. Текст сохранён полностью и открыт в исходном виде."
            : "Материал содержит исполняемый HTML и открыт как исходный текст в целях безопасности."}
        </p>
        {markdownError ? (
          <button
            className="text-button"
            type="button"
            onClick={() => setMarkdownError(null)}
          >
            Попробовать визуальный режим
          </button>
        ) : null}
        <textarea
          aria-label="Исходный текст материала"
          value={sourceMarkdown}
          onChange={(event) => {
            const nextMarkdown = event.target.value;

            if (markdownError) {
              setMarkdownError({ ...markdownError, source: nextMarkdown });
            }

            onChange(nextMarkdown);
          }}
          onBlur={(event) => onSave(event.target.value)}
        />
      </div>
    );
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pastedText = event.clipboardData.getData("text/plain");
    const editor = editorRef.current;

    if (!pastedText || !editor || !looksLikeMarkdown(pastedText)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const normalizedText = pastedText.replace(/\r\n?/g, "\n");

    editor.focus(
      () => editor.insertMarkdown(normalizedText),
      { defaultSelection: "rootEnd", preventScroll: true },
    );
  }

  return (
    <div onPasteCapture={handlePaste}>
      <MDXEditor
        ref={editorRef}
        className="material-mdx-editor"
        contentEditableClassName="material-editor-surface"
        markdown={markdown}
        onChange={onChange}
        onError={(payload) => {
          setMarkdownError(payload);
          onChange(payload.source);
          onSave(payload.source);
        }}
        onBlur={() => onSave(editorRef.current?.getMarkdown() ?? markdown)}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          tablePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          codeBlockPlugin({
            defaultCodeBlockLanguage: "",
            codeBlockEditorDescriptors: [plainCodeBlockDescriptor],
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <TextColorControls />
                <CreateLink />
                <InsertCodeBlock />
                <InsertTable />
                <InsertThematicBreak />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}

export function MaterialPreview({ markdown }: MaterialPreviewProps) {
  if (containsExecutableHtml(markdown)) {
    return <pre className="material-source-preview">{markdown}</pre>;
  }

  return (
    <MDXEditor
      className="material-markdown-preview"
      contentEditableClassName="material-editor-surface material-preview-surface"
      markdown={markdown || "Материал пока пуст."}
      readOnly
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        tablePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        codeBlockPlugin({
          defaultCodeBlockLanguage: "",
          codeBlockEditorDescriptors: [plainCodeBlockDescriptor],
        }),
      ]}
    />
  );
}
