import { createClient } from "npm:@supabase/supabase-js@2";

type DigestSettingRow = {
  user_id: string;
  email: string;
  delivery_hour: number;
  timezone: string;
  last_sent_on: string | null;
};

type ProjectRow = {
  id: string;
  title: string;
  status: "active" | "paused" | "done" | "archived";
  priority: "low" | "medium" | "high";
  due_date: string | null;
};

type TaskRow = {
  project_id: string;
  parent_task_id: string | null;
  title: string;
  done: boolean;
  position: number;
  due_date: string | null;
};

const statusLabels = {
  active: "В работе",
  paused: "Пауза",
  done: "Готово",
  archived: "Архив",
} as const;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getLocalDateAndHour(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

function getProjectTasks(tasks: TaskRow[], projectId: string) {
  return tasks
    .filter((task) => task.project_id === projectId)
    .sort((a, b) => {
      const parentCompare = (a.parent_task_id ?? "").localeCompare(b.parent_task_id ?? "");
      return parentCompare || a.position - b.position;
    });
}

function renderDigest(
  projects: ProjectRow[],
  tasks: TaskRow[],
  localDate: string,
  appUrl: string,
) {
  const visibleProjects = projects.filter(
    (project) =>
      project.status !== "archived" &&
      tasks.some((task) => task.project_id === project.id),
  );
  const activeCount = visibleProjects.filter((project) => project.status === "active").length;
  const pausedCount = visibleProjects.filter((project) => project.status === "paused").length;
  const completedCount = visibleProjects.filter((project) => project.status === "done").length;
  const overdueTasks = tasks.filter(
    (task) => !task.done && task.due_date && task.due_date < localDate,
  );
  const dueTodayTasks = tasks.filter(
    (task) => !task.done && task.due_date === localDate,
  );

  const projectBlocks = visibleProjects
    .map((project) => {
      const projectTasks = getProjectTasks(tasks, project.id);
      const doneTasks = projectTasks.filter((task) => task.done).length;
      const nextTask = projectTasks.find((task) => !task.done);
      const progress = projectTasks.length
        ? Math.round((doneTasks / projectTasks.length) * 100)
        : 0;
      const deadline = project.due_date
        ? `<span style="color:#68786f">Срок: ${escapeHtml(project.due_date)}</span>`
        : "";

      return `
        <div style="padding:16px 0;border-bottom:1px solid #e5e9e5">
          <div style="display:flex;justify-content:space-between;gap:12px">
            <strong style="color:#1f3d35">${escapeHtml(project.title)}</strong>
            <span style="display:inline-block;margin-left:16px;white-space:nowrap;color:#52645c">${statusLabels[project.status]}</span>
          </div>
          <div style="margin-top:7px;color:#52645c">
            Задачи: ${doneTasks} из ${projectTasks.length} · ${progress}%
            ${deadline ? ` · ${deadline}` : ""}
          </div>
          <div style="margin-top:7px;color:#24342e">
            ${
              nextTask
                ? `<strong>Следующая задача:</strong> ${escapeHtml(nextTask.title)}`
                : "Все задачи выполнены"
            }
          </div>
        </div>
      `;
    })
    .join("");

  const urgentItems = [...overdueTasks, ...dueTodayTasks]
    .slice(0, 12)
    .map((task) => {
      const project = projects.find((item) => item.id === task.project_id);
      const prefix = task.due_date && task.due_date < localDate ? "Просрочено" : "Сегодня";
      return `<li style="margin:6px 0"><strong>${prefix}:</strong> ${escapeHtml(task.title)}${
        project ? ` — ${escapeHtml(project.title)}` : ""
      }</li>`;
    })
    .join("");

  const html = `
    <!doctype html>
    <html lang="ru">
      <body style="margin:0;background:#f3f6f3;font-family:Arial,sans-serif;color:#24342e">
        <div style="max-width:680px;margin:0 auto;padding:28px 18px">
          <div style="background:#fff;border:1px solid #dbe3dc;border-radius:14px;padding:28px">
            <div style="color:#467266;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Loom</div>
            <h1 style="margin:8px 0 4px;font-size:26px">Ежедневная сводка</h1>
            <p style="margin:0;color:#68786f">${escapeHtml(localDate)}</p>

            <div style="margin:24px 0;padding:16px;background:#f7faf7;border-radius:10px">
              В работе: <strong>${activeCount}</strong> ·
              На паузе: <strong>${pausedCount}</strong> ·
              Завершено: <strong>${completedCount}</strong>
            </div>

            ${
              urgentItems
                ? `<h2 style="font-size:18px">Требуют внимания</h2><ul style="padding-left:20px">${urgentItems}</ul>`
                : '<p style="color:#467266"><strong>На сегодня нет просроченных задач и задач со сроком сегодня.</strong></p>'
            }

            <h2 style="margin-top:26px;font-size:18px">Проекты</h2>
            ${projectBlocks || '<p style="color:#68786f">Проектов с задачами пока нет.</p>'}

            <a href="${escapeHtml(appUrl)}" style="display:inline-block;margin-top:24px;padding:11px 16px;border-radius:8px;background:#35695d;color:#fff;text-decoration:none;font-weight:700">
              Открыть Loom
            </a>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = [
    `Loom — ежедневная сводка за ${localDate}`,
    "",
    `В работе: ${activeCount}; на паузе: ${pausedCount}; завершено: ${completedCount}.`,
    "",
    overdueTasks.length || dueTodayTasks.length ? "Требуют внимания:" : "Срочных задач нет.",
    ...[...overdueTasks, ...dueTodayTasks].slice(0, 12).map((task) => {
      const project = projects.find((item) => item.id === task.project_id);
      return `- ${task.title}${project ? ` — ${project.title}` : ""} (${task.due_date})`;
    }),
    "",
    "Проекты:",
    ...visibleProjects.map((project) => {
      const projectTasks = getProjectTasks(tasks, project.id);
      const doneTasks = projectTasks.filter((task) => task.done).length;
      const nextTask = projectTasks.find((task) => !task.done);
      return `- ${project.title}: ${statusLabels[project.status]}, задачи ${doneTasks}/${projectTasks.length}${
        nextTask ? `, следующая задача: ${nextTask.title}` : ", все задачи выполнены"
      }`;
    }),
    "",
    appUrl,
  ].join("\n");

  return { html, text };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("DAILY_DIGEST_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const forceSend = request.headers.get("x-force-send") === "true";
  const invocationId =
    request.headers.get("x-invocation-id")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100) ||
    new Date().toISOString().slice(0, 13);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("DIGEST_FROM_EMAIL") || "Loom <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") || "http://127.0.0.1:5173";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return Response.json({ error: "Required function secrets are not configured." }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: settings, error: settingsError } = await admin
    .from("digest_settings")
    .select("user_id,email,delivery_hour,timezone,last_sent_on")
    .eq("enabled", true);

  if (settingsError) {
    return Response.json({ error: settingsError.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ userId: string; message: string }> = [];

  for (const setting of (settings ?? []) as DigestSettingRow[]) {
    let localTime: { date: string; hour: number };

    try {
      localTime = getLocalDateAndHour(setting.timezone);
    } catch {
      errors.push({ userId: setting.user_id, message: `Invalid timezone: ${setting.timezone}` });
      continue;
    }

    if (
      !forceSend &&
      (localTime.hour !== setting.delivery_hour ||
        setting.last_sent_on === localTime.date)
    ) {
      skipped += 1;
      continue;
    }

    const [{ data: projects, error: projectsError }, { data: tasks, error: tasksError }] =
      await Promise.all([
        admin
          .from("projects")
          .select("id,title,status,priority,due_date")
          .eq("user_id", setting.user_id),
        admin
          .from("project_tasks")
          .select("project_id,parent_task_id,title,done,position,due_date")
          .eq("user_id", setting.user_id),
      ]);

    if (projectsError || tasksError) {
      errors.push({
        userId: setting.user_id,
        message: projectsError?.message || tasksError?.message || "Could not load digest data.",
      });
      continue;
    }

    const digest = renderDigest(
      (projects ?? []) as ProjectRow[],
      (tasks ?? []) as TaskRow[],
      localTime.date,
      appUrl,
    );
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `loom-digest-${setting.user_id}-${
          forceSend ? invocationId : localTime.date
        }`,
        "User-Agent": "loom-daily-digest/1.0",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [setting.email],
        subject: `Loom: состояние проектов за ${localTime.date}`,
        html: digest.html,
        text: digest.text,
      }),
    });

    if (!emailResponse.ok) {
      errors.push({
        userId: setting.user_id,
        message: `Resend ${emailResponse.status}: ${await emailResponse.text()}`,
      });
      continue;
    }

    const { error: updateError } = await admin
      .from("digest_settings")
      .update({
        last_sent_on: localTime.date,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", setting.user_id);

    if (updateError) {
      errors.push({ userId: setting.user_id, message: updateError.message });
      continue;
    }

    sent += 1;
  }

  return Response.json(
    { sent, skipped, errors, forced: forceSend },
    { status: errors.length ? 207 : 200 },
  );
});
