import { supabase } from "./supabase";

export type DigestSettings = {
  email: string;
  enabled: boolean;
  deliveryHour: number;
  timezone: string;
  lastSentOn?: string;
};

export function createDefaultDigestSettings(email: string): DigestSettings {
  return {
    email,
    enabled: false,
    deliveryHour: 9,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow",
  };
}

export async function loadDigestSettings(email: string): Promise<DigestSettings> {
  if (!supabase) {
    return createDefaultDigestSettings(email);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("Для настройки рассылки нужно войти в аккаунт.");
  }

  const { data, error } = await supabase
    .from("digest_settings")
    .select("email,enabled,delivery_hour,timezone,last_sent_on")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return createDefaultDigestSettings(email);
  }

  return {
    email: data.email,
    enabled: data.enabled,
    deliveryHour: data.delivery_hour,
    timezone: data.timezone,
    lastSentOn: data.last_sent_on ?? undefined,
  };
}

export async function saveDigestSettings(settings: DigestSettings) {
  if (!supabase) {
    throw new Error("Supabase не настроен.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("Для настройки рассылки нужно войти в аккаунт.");
  }

  const { error } = await supabase.from("digest_settings").upsert(
    {
      user_id: user.id,
      email: settings.email.trim(),
      enabled: settings.enabled,
      delivery_hour: settings.deliveryHour,
      timezone: settings.timezone.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}
