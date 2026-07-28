# Ежедневная сводка проектов

Loom может раз в сутки отправлять пользователю письмо с состоянием проектов, прогрессом задач,
просроченными задачами и задачами со сроком сегодня.

## Как это работает

1. Пользователь нажимает значок колокольчика в Loom и выбирает адрес, час отправки и часовой пояс.
2. Настройки сохраняются в таблице `public.digest_settings`.
3. GitHub Actions раз в час вызывает Supabase Edge Function `daily-digest`.
4. Функция выбирает пользователей, у которых наступил заданный локальный час и сводка ещё не
   отправлялась в этот день.
5. Письмо отправляется через Resend, после чего в `last_sent_on` записывается локальная дата.

Повторный запуск безопасен: запрос к Resend содержит идемпотентный ключ пользователя и даты.

## Однократная настройка Resend

1. Создайте аккаунт в Resend.
2. Для тестовой отправки на собственный адрес можно использовать
   `Loom <onboarding@resend.dev>`.
3. Для отправки другим пользователям добавьте и подтвердите собственный домен.
4. Создайте API-ключ Resend.

Сгенерируйте отдельный случайный секрет для запуска функции:

```powershell
[Convert]::ToHexString(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).ToLower()
```

Добавьте секреты в Supabase Edge Function Secrets:

```powershell
npx supabase secrets set `
  RESEND_API_KEY=re_xxxxxxxxx `
  DAILY_DIGEST_CRON_SECRET=<случайный-секрет> `
  DIGEST_FROM_EMAIL="Loom <digest@example.com>" `
  APP_URL=https://example.com
```

В GitHub откройте:

```text
Repository → Settings → Environments → production → Environment secrets
```

Добавьте:

```text
DAILY_DIGEST_CRON_SECRET = тот же случайный секрет
```

Секрет должен полностью совпадать со значением в Supabase.

## Развёртывание

После попадания изменений в `main` workflow `Database migrations`:

1. применит миграцию `202607280002_daily_digest_settings.sql`;
2. развернёт Edge Function `daily-digest`.

Workflow `Daily project digest` запускается каждый час на седьмой минуте. Его также можно
запустить вручную через `Run workflow`. Ручной запуск немедленно отправляет сводку всем
пользователям, у которых она включена, независимо от выбранного часа. Запуск по расписанию
по-прежнему отправляет письмо только в выбранный пользователем час и не чаще одного раза в день.

## Проверка

1. Откройте Loom и нажмите колокольчик.
2. Включите сводку, укажите текущий час и сохраните.
3. Запустите `Daily project digest` вручную в GitHub Actions.
4. Проверьте письмо и значение `last_sent_on`:

```sql
select email, enabled, delivery_hour, timezone, last_sent_on
from public.digest_settings;
```

Если письмо не пришло, проверьте логи Edge Function в Supabase Dashboard. Чаще всего причиной
является неподтверждённый домен отправителя, неверный `RESEND_API_KEY` или несовпадающий
`DAILY_DIGEST_CRON_SECRET`.

## Безопасность

- Не добавляйте ключ Resend и секрет запуска в Git или `.env`, который отслеживается Git.
- `SUPABASE_SERVICE_ROLE_KEY` не требуется добавлять вручную: Supabase предоставляет его
  развёрнутой Edge Function автоматически.
- Edge Function доступна без JWT только для планировщика, но каждый запрос проверяет длинный
  случайный заголовок `x-cron-secret`.
