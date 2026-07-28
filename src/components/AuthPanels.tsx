import { type FormEvent, useState } from "react";
import { getErrorMessage } from "../projectModel";
import { supabase } from "../supabase";

const PASSWORD_RECOVERY_REQUESTED_KEY = "loom.passwordRecoveryRequested";
const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, "");

export function isRecoveryUrl() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    params.get("mode") === "recovery" ||
    params.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  );
}

export function getRecoveryCode() {
  return new URLSearchParams(window.location.search).get("code");
}

export function getHashSessionTokens() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

export function isPasswordRecoveryRequested() {
  return window.localStorage.getItem(PASSWORD_RECOVERY_REQUESTED_KEY) === "true";
}

export function setPasswordRecoveryRequested() {
  window.localStorage.setItem(PASSWORD_RECOVERY_REQUESTED_KEY, "true");
}

export function clearPasswordRecoveryRequested() {
  window.localStorage.removeItem(PASSWORD_RECOVERY_REQUESTED_KEY);
}

export function getPasswordRecoveryRedirectUrl() {
  return `${appUrl}/?mode=recovery`;
}

type AuthMode = "sign-in" | "sign-up" | "reset-password";

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !email.trim() || (mode !== "reset-password" && !password)) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const { error } = await (async () => {
      if (mode === "reset-password") {
        return supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: getPasswordRecoveryRedirectUrl(),
        });
      }

      clearPasswordRecoveryRequested();

      const credentials = {
        email: email.trim(),
        password,
      };

      return mode === "sign-in"
        ? supabase.auth.signInWithPassword(credentials)
        : supabase.auth.signUp(credentials);
    })();

    setIsSubmitting(false);

    if (error) {
      const errorMessage = getErrorMessage(error);
      setMessage(
        errorMessage
          ? `Не удалось выполнить действие: ${errorMessage}`
          : "Не удалось выполнить действие.",
      );
      return;
    }

    setMessage(
      mode === "reset-password"
        ? "Проверь почту и открой ссылку сброса пароля."
        : mode === "sign-in"
          ? "Вход выполнен."
          : "Аккаунт создан. Если Supabase требует подтверждение email, проверь почту.",
    );

    if (mode === "reset-password") {
      setPasswordRecoveryRequested();
    } else {
      clearPasswordRecoveryRequested();
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={handleAuth}>
        <p className="eyebrow">Loom</p>
        <h1>
          {mode === "reset-password"
            ? "Сброс пароля"
            : mode === "sign-in"
              ? "Вход"
              : "Регистрация"}
        </h1>
        <p>
          {mode === "reset-password"
            ? "Укажи email, и Supabase отправит ссылку для установки нового пароля."
            : mode === "sign-in"
              ? "Войди с email и паролем."
              : "Создай аккаунт с email и паролем."}
        </p>

        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {mode !== "reset-password" ? (
          <label>
            Пароль
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Минимум 6 символов"
            />
          </label>
        ) : null}

        <button className="text-button primary" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Проверяем..."
            : mode === "reset-password"
              ? "Отправить ссылку"
              : mode === "sign-in"
                ? "Войти"
                : "Создать аккаунт"}
        </button>

        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setMessage("");
          }}
        >
          {mode === "sign-in" ? "Создать аккаунт" : "Уже есть аккаунт"}
        </button>

        {mode !== "reset-password" ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setMode("reset-password");
              setPassword("");
              setMessage("");
            }}
          >
            Сбросить пароль
          </button>
        ) : null}

        {message ? <p className="auth-message">{message}</p> : null}
      </form>
    </main>
  );
}

type PasswordRecoveryPanelProps = {
  onComplete: () => void;
};

export function PasswordRecoveryPanel({ onComplete }: PasswordRecoveryPanelProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !password) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);

    if (error) {
      const errorMessage = getErrorMessage(error);
      setMessage(
        errorMessage
          ? `Не удалось обновить пароль: ${errorMessage}`
          : "Не удалось обновить пароль.",
      );
      return;
    }

    setPassword("");
    setMessage("Пароль обновлен.");
    window.history.replaceState({}, document.title, window.location.origin);
    clearPasswordRecoveryRequested();
    onComplete();
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={handleUpdatePassword}>
        <p className="eyebrow">Loom</p>
        <h1>Новый пароль</h1>
        <p>Задай новый пароль для текущего аккаунта.</p>

        <label>
          Новый пароль
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Минимум 6 символов"
          />
        </label>

        <button className="text-button primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Сохраняем..." : "Сохранить пароль"}
        </button>

        {message ? <p className="auth-message">{message}</p> : null}
      </form>
    </main>
  );
}
