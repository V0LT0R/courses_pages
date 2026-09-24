# AQUAGEO — семинары и тренинги, версия 2

Полный React/Express проект с Supabase Auth/PostgreSQL/Storage. Код изменён и проверен локально. Допуск к production требует применения SQL на staging и проверки реальной конфигурации Auth/Storage/SMTP/домена. Результаты выполненных проверок находятся в `VALIDATION_REPORT.md`; требования и границы защиты — в `SECURITY.md`.

## Быстрый запуск

1. Установите Node.js 22.12+ (рекомендуется поддерживаемая версия 24.x).
2. Для существующей базы: резервная копия → **целиком** `supabase/migrate_existing_database.sql` в Supabase SQL Editor → `supabase/verify_database.sql`. Для новой базы вместо миграции используйте `supabase/full_schema.sql`.
3. Скопируйте `.env.example` в `.env`, заполните Supabase URL, публичный ключ и серверный service_role/secret key. Для локальной разработки оставьте PUBLIC_APP_URL и CERT_BASE_URL равными `http://localhost:5173`.
4. Выполните `npm ci`, `npm run verify:release`, `npm run dev`. Откройте `http://localhost:5173`. На Windows можно использовать `INSTALL_AND_CHECK.bat`, затем `START_DEV.bat`.
5. В Supabase Auth задайте Site URL и redirect URL `http://localhost:5173/reset-password`, включите email confirmation и настройте SMTP. В production замените их своим HTTPS-доменом.

Сервер больше не требует DATABASE_URL, JWT_SECRET или Ed25519-ключи. Не помещайте service_role/secret key в VITE_*: frontend-переменные доступны посетителям. Vite использует только публичные VITE_ значения; backend-only секреты держите исключительно в окружении Node. Не копируйте исходный `.env` целиком поверх нового примера.

## Организация и первый администратор

Зарегистрируйте свой аккаунт через `/signup`, подтвердите email. В SQL Editor выполните с вашим email:

```sql
update public.profiles set role='admin' where email='YOUR_EMAIL';
update public.app_settings set issuer_name='Название вашей организации' where id=true;
```

Затем выйдите и войдите. Организация сохраняется в сертификат на момент выдачи. Ранее выданные сертификаты не меняются. Менеджеров создаёт администратор в кабинете; отдельная Edge Function не нужна. Удалите ранее развёрнутую `create-manager` Edge Function (см. MIGRATION_GUIDE).

## Сценарий

Администратор/менеджер создаёт курс, разделы, материалы и итоговый тест (5–200 вопросов, 2–6 вариантов, один правильный, 1–480 минут; проходной балл 60/70/80/90/100). Студент записывается, подтверждает ознакомление, сдаёт тест и получает сертификат. Лимит: 10 новых попыток за скользящие 24 часа. Повторное начало возобновляет действующую попытку. Повторный запрос сертификата возвращает уже выданный номер. Список сертификатов доступен в кабинете.

Публичный `/verify/{номер}` показывает данные и сам сертификат со ссылкой на PDF; QR ведёт туда же. PDF формируется без часов, со встроенным шрифтом и сохранённым снимком ФИО/семинара/оценки/даты. ФИО заполняет участник; проверки паспорта нет.

## Старые сертификаты

Если прежняя версия уже выдавала сертификаты в `local_certificate_records`, сначала выполните перенос по `MIGRATION_GUIDE.md`. Один SQL в Supabase не может прочитать вашу отдельную старую БД. Утилита `scripts/import-legacy-certificates.mjs` работает сначала в dry-run, затем с `--apply`. Не открывайте новую выдачу до завершения переноса, иначе появятся конфликты с прежними номерами.

## Файлы

- `MIGRATION_GUIDE.md` — порядок обновления и отката.
- `TESTING.md` — unit/integration/security/concurrency/smoke/load.
- `DEPLOYMENT.md`, `DEPLOYMENT_SECURITY.md` — Node, reverse proxy, HTTPS, Supabase, DDoS.
- `ARCHITECTURE.md`, `SECURITY.md`, `CHANGELOG.md` — решения, аудит и изменения.
- `supabase/source/` — исходники SQL; `npm run sql:build` обновляет два итоговых SQL-файла.
- `compose.test.yml` — отдельный PostgreSQL для конкурентных тестов, без постоянного тома.

Не запускайте SQL из `tests/fixtures/`: это предыдущая схема только для автоматического теста миграции. Старые названия SQL в `supabase/` оставлены как явно неисполняемые указатели на новую миграцию.
