import { createClient } from "npm:@supabase/supabase-js@2";

type DraftRequest = {
  projectId?: unknown;
  taskId?: unknown;
  prompt?: unknown;
};

type OpenAIResponse = {
  error?: { message?: string };
  output?: Array<{
    type?: string;
    action?: {
      sources?: Array<{ title?: string; url?: string }>;
    };
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

type MaterialDraft = {
  title: string;
  markdown: string;
};

type DraftSource = {
  title: string;
  url: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSources(response: OpenAIResponse): DraftSource[] {
  const sources = new Map<string, DraftSource>();

  for (const item of response.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      try {
        const url = new URL(source.url ?? "");

        if (url.protocol !== "https:" && url.protocol !== "http:") {
          continue;
        }

        const normalizedUrl = url.toString();
        sources.set(normalizedUrl, {
          title: normalizeText(source.title) || url.hostname,
          url: normalizedUrl,
        });
      } catch {
        // Ignore malformed source URLs returned by the upstream search tool.
      }
    }
  }

  return Array.from(sources.values()).slice(0, 12);
}

function extractDraft(response: OpenAIResponse): MaterialDraft | null {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type !== "output_text" || !content.text) {
        continue;
      }

      try {
        const parsed = JSON.parse(content.text) as Partial<MaterialDraft>;
        const title = normalizeText(parsed.title).replace(/\s+/g, " ").slice(0, 140);
        const markdown = normalizeText(parsed.markdown).slice(0, 30_000);

        if (title && markdown) {
          return { title, markdown };
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-5.6-terra";
  const configuredLimit = Number(Deno.env.get("AI_DAILY_LIMIT") || "10");
  const dailyLimit = Number.isFinite(configuredLimit)
    ? Math.max(1, Math.floor(configuredLimit))
    : 10;
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !openAiApiKey) {
    return jsonResponse({ error: "AI assistant secrets are not configured." }, 500);
  }

  if (!authorization) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Invalid or expired session." }, 401);
  }

  let body: DraftRequest;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const projectId = normalizeText(body.projectId);
  const taskId = normalizeText(body.taskId);
  const prompt = normalizeText(body.prompt);

  if (!projectId || prompt.length < 10 || prompt.length > 1500) {
    return jsonResponse(
      { error: "Specify a project and a request between 10 and 1500 characters." },
      400,
    );
  }

  const { data: project, error: projectError } = await userClient
    .from("projects")
    .select("id,title,description")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return jsonResponse({ error: "Project not found." }, 404);
  }

  let task: { id: string; title: string; description: string | null } | null = null;

  if (taskId) {
    const { data: taskData, error: taskError } = await userClient
      .from("project_tasks")
      .select("id,title,description")
      .eq("id", taskId)
      .eq("project_id", projectId)
      .single();

    if (taskError || !taskData) {
      return jsonResponse({ error: "Task not found in the selected project." }, 404);
    }

    task = taskData;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("ai_assistant_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);

  if (countError) {
    return jsonResponse({ error: "Could not check the AI request limit." }, 500);
  }

  if ((count ?? 0) >= dailyLimit) {
    return jsonResponse(
      { error: `Daily AI request limit reached (${dailyLimit} per 24 hours).` },
      429,
    );
  }

  const requestId = crypto.randomUUID();
  const { error: usageError } = await admin.from("ai_assistant_requests").insert({
    id: requestId,
    user_id: user.id,
    project_id: projectId,
    task_id: taskId || null,
    model,
  });

  if (usageError) {
    return jsonResponse({ error: "Could not register the AI request." }, 500);
  }

  const context = [
    `Проект: ${project.title}`,
    project.description ? `Описание проекта: ${project.description}` : "",
    task ? `Задача: ${task.title}` : "",
    task?.description ? `Описание задачи: ${task.description}` : "",
    "",
    `Запрос пользователя: ${prompt}`,
  ]
    .filter(Boolean)
    .join("\n");

  let openAiResponse: Response;

  try {
    openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        tools: [{ type: "web_search", search_context_size: "low" }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        instructions: [
          "Ты создаёшь только черновик информационного материала для системы управления проектами.",
          "Отвечай на русском языке.",
          "Используй веб-поиск, когда запрос требует фактической или актуальной информации.",
          "Не предлагай менять проекты или задачи и не утверждай, что что-либо сохранено.",
          "Сделай самостоятельный, практичный Markdown-документ с ясными заголовками.",
          "Не добавляй раздел источников: приложение добавит проверенный список отдельно.",
          "Не включай HTML.",
        ].join(" "),
        input: context,
        max_output_tokens: 6000,
        text: {
          format: {
            type: "json_schema",
            name: "loom_material_draft",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Краткое название материала без Markdown-разметки.",
                },
                markdown: {
                  type: "string",
                  description: "Полный текст материала в Markdown.",
                },
              },
              required: ["title", "markdown"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
  } catch {
    await admin
      .from("ai_assistant_requests")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", requestId);

    return jsonResponse({ error: "Could not connect to OpenAI." }, 502);
  }

  let openAiBody: OpenAIResponse;

  try {
    openAiBody = (await openAiResponse.json()) as OpenAIResponse;
  } catch {
    await admin
      .from("ai_assistant_requests")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", requestId);

    return jsonResponse({ error: "OpenAI returned an invalid response." }, 502);
  }

  if (!openAiResponse.ok) {
    await admin
      .from("ai_assistant_requests")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", requestId);

    return jsonResponse(
      { error: openAiBody.error?.message || `OpenAI request failed (${openAiResponse.status}).` },
      502,
    );
  }

  const draft = extractDraft(openAiBody);

  if (!draft) {
    await admin
      .from("ai_assistant_requests")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", requestId);

    return jsonResponse({ error: "The model returned an invalid material draft." }, 502);
  }

  await admin
    .from("ai_assistant_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", requestId);

  return jsonResponse({
    ...draft,
    sources: normalizeSources(openAiBody),
    remaining: Math.max(0, dailyLimit - (count ?? 0) - 1),
  });
});
