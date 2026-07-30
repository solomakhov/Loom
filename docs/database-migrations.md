# Миграции базы данных

Loom использует историю миграций Supabase CLI в таблице
`supabase_migrations.schema_migrations`. Изменения схемы необходимо добавлять
новыми файлами в `supabase/migrations`. Нельзя редактировать миграцию, которая
уже была применена в рабочей среде.

## Локальный процесс

Docker Desktop должен быть запущен.

```powershell
npm install
npm run db:start
npm run db:reset
```

Полезные команды:

```powershell
npm run db:migrations
npm run db:push:dry-run
npm run db:push
npm run db:stop
```

Создание новой миграции:

```powershell
npx supabase migration new descriptive_name
```

## Однократная настройка удалённого проекта

Свяжите репозиторий с существующим проектом Supabase:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push:dry-run
```

Первые миграции Loom применялись вручную и записывали сведения в старую таблицу
`public.schema_migrations`. Supabase CLI использует другую таблицу:
`supabase_migrations.schema_migrations`. Существующие файлы миграций
идемпотентны, поэтому их можно повторно выполнить при первом запуске `db push`.
Перед применением обязательно проверьте результат пробного запуска.

Миграция `202607300001_realtime_collaboration.sql` добавляет счётчики версий и
включает таблицы рабочего пространства в публикацию `supabase_realtime`.
Её необходимо применить до развёртывания фронтенда с поддержкой совместной
работы: новая версия приложения читает колонку `revision`.

Если удалённая схема и история CLI не совпадают, изучите их с помощью
`npm run db:migrations`. Используйте `supabase migration repair` только после
проверки, что соответствующее изменение схемы уже присутствует в базе данных.

## GitHub Actions

`.github/workflows/database-migrations.yml` проверяет всю цепочку миграций
в пул-реквестах. После попадания миграции в `main` процесс применяет ожидающие
миграции к рабочему проекту.

Создайте защищённое окружение GitHub с именем `production` и добавьте секреты:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

Развёртывание в рабочую среду ожидает завершения проверки и использует группу
конкурентности, поэтому два изменения схемы не могут применяться одновременно.

Настройка и проверка ежедневной почтовой сводки описаны в
[`daily-digest.md`](daily-digest.md).

Настройка, ограничения и проверка ИИ-ассистента описаны в
[`ai-assistant.md`](ai-assistant.md).
