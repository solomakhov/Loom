import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  activeEditor$,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import { useCellValue } from "@mdxeditor/gurx";
import { $patchStyleText } from "@lexical/selection";
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type RangeSelection,
} from "lexical";
import { type ClipboardEvent, useRef, useState } from "react";

type MaterialEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
};

function looksLikeMarkdown(value: string) {
  return (
    /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~|---\s*$)/m.test(value) ||
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/.test(value)
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

export function MaterialEditor({ markdown, onChange }: MaterialEditorProps) {
  const editorRef = useRef<MDXEditorMethods>(null);

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pastedText = event.clipboardData.getData("text/plain");
    const pastedHtml = event.clipboardData.getData("text/html");

    if (
      !pastedText ||
      !editorRef.current ||
      (pastedHtml && !looksLikeMarkdown(pastedText))
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    editorRef.current.insertMarkdown(pastedText);
  }

  return (
    <div onPasteCapture={handlePaste}>
      <MDXEditor
        ref={editorRef}
        className="material-mdx-editor"
        contentEditableClassName="material-editor-surface"
        markdown={markdown}
        onChange={onChange}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          tablePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
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
