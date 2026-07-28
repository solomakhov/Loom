import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import { type ClipboardEvent, useRef } from "react";

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
                <CreateLink />
                <InsertThematicBreak />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}
