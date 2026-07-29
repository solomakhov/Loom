import { supabase } from "./supabase";

export type AiDraftSource = {
  title: string;
  url: string;
};

export type AiMaterialDraft = {
  title: string;
  markdown: string;
  sources: AiDraftSource[];
  remaining: number;
};

type GenerateMaterialDraftInput = {
  projectId: string;
  taskId?: string;
  prompt: string;
};

function isDraftSource(value: unknown): value is AiDraftSource {
  if (!value || typeof value !== "object") {
    return false;
  }

  const source = value as Partial<AiDraftSource>;
  return typeof source.title === "string" && typeof source.url === "string";
}

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "Неизвестная ошибка.";
  const context = (error as { context?: Response } | null)?.context;

  if (!context) {
    return fallback;
  }

  try {
    const body = await context.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export async function generateMaterialDraft(
  input: GenerateMaterialDraftInput,
): Promise<AiMaterialDraft> {
  if (!supabase) {
    throw new Error("Supabase не настроен.");
  }

  const { data, error } = await supabase.functions.invoke("ai-material-draft", {
    body: input,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (
    !data ||
    typeof data.title !== "string" ||
    typeof data.markdown !== "string"
  ) {
    throw new Error("ИИ вернул некорректный черновик.");
  }

  return {
    title: data.title,
    markdown: data.markdown,
    sources: Array.isArray(data.sources) ? data.sources.filter(isDraftSource) : [],
    remaining: typeof data.remaining === "number" ? data.remaining : 0,
  };
}

