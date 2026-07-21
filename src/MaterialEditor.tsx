import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  MDXEditorMethods,
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
import { useEffect, useRef } from "react";

type MaterialEditorProps = {
  materialId: string;
  markdown: string;
  onChange: (markdown: string) => void;
};

export function MaterialEditor({ materialId, markdown, onChange }: MaterialEditorProps) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const isApplyingMarkdownRef = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;

    if (editor && editor.getMarkdown() !== markdown) {
      isApplyingMarkdownRef.current = true;
      editor.setMarkdown(markdown);

      window.requestAnimationFrame(() => {
        isApplyingMarkdownRef.current = false;
      });
    }
  }, [materialId, markdown]);

  return (
    <MDXEditor
      ref={editorRef}
      className="material-mdx-editor"
      contentEditableClassName="material-editor-surface"
      markdown={markdown}
      onChange={(nextMarkdown, initialMarkdownNormalize) => {
        if (!initialMarkdownNormalize && !isApplyingMarkdownRef.current) {
          onChange(nextMarkdown);
        }
      }}
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
  );
}
