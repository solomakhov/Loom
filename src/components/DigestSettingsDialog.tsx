import { BellRing, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  createDefaultDigestSettings,
  loadDigestSettings,
  saveDigestSettings,
  type DigestSettings,
} from "../digestSettings";
import { getErrorMessage } from "../projectModel";

type DigestSettingsDialogProps = {
  accountEmail: string;
  onClose: () => void;
};

export function DigestSettingsDialog({ accountEmail, onClose }: DigestSettingsDialogProps) {
  const [settings, setSettings] = useState<DigestSettings>(() =>
    createDefaultDigestSettings(accountEmail),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    loadDigestSettings(accountEmail)
      .then((loadedSettings) => {
        if (isMounted) {
          setSettings(loadedSettings);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setMessage(`Не удалось загрузить настройки: ${getErrorMessage(error)}`);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accountEmail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      await saveDigestSettings(settings);
      setMessage("Настройки рассылки сохранены.");
    } catch (error) {
      setMessage(`Не удалось сохранить настройки: ${getErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        className="modal-panel digest-settings-dialog"
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="digest-settings-title"
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">Уведомления</p>
            <h2 id="digest-settings-title">Ежедневная сводка</h2>
            <p>Состояние проектов, прогресс и ближайшие сроки одним письмом.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <p className="muted">Загружаем настройки...</p>
        ) : (
          <>
            <label className="digest-toggle">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) =>
                  setSettings({ ...settings, enabled: event.target.checked })
                }
              />
              <span>
                <strong>Присылать ежедневную сводку</strong>
                <small>Письмо отправляется только один раз в выбранный локальный день.</small>
              </span>
            </label>

            <label>
              Адрес получателя
              <input
                required
                type="email"
                value={settings.email}
                onChange={(event) => setSettings({ ...settings, email: event.target.value })}
              />
            </label>

            <div className="form-grid">
              <label>
                Час отправки
                <select
                  value={settings.deliveryHour}
                  onChange={(event) =>
                    setSettings({ ...settings, deliveryHour: Number(event.target.value) })
                  }
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Часовой пояс
                <input
                  required
                  value={settings.timezone}
                  onChange={(event) =>
                    setSettings({ ...settings, timezone: event.target.value })
                  }
                  placeholder="Europe/Moscow"
                />
              </label>
            </div>

            {settings.lastSentOn ? (
              <p className="muted">Последняя успешная отправка: {settings.lastSentOn}</p>
            ) : null}
          </>
        )}

        {message ? <p className="auth-message">{message}</p> : null}

        <div className="form-actions">
          <button className="text-button" type="button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="text-button primary"
            type="submit"
            disabled={isLoading || isSaving}
          >
            <BellRing size={16} />
            {isSaving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
