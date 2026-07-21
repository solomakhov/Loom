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
  markdown: string;
  onChange: (markdown: string) => void;
};

export function MaterialEditor({ markdown, onChange }: MaterialEditorProps) {
  const editorRef = useRef<MDXEditorMethods>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.getMarkdown() !== markdown) {
      editorRef.current.setMarkdown(markdown);
    }
  }, [markdown]);

  return (
    <MDXEditor
      ref={editorRef}
      className="material-mdx-editor"
      contentEditableClassName="material-editor-surface"
      markdown={markdown}
      onChange={(nextMarkdown, initialMarkdownNormalize) => {
        if (!initialMarkdownNormalize) {
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
