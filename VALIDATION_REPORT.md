# Результаты проверки

Актуальное обновление семинаров от 24.09.2026: [инструкция SQL](docs/SUPABASE_SEMINARS_UPDATE.md) и [результаты проверки](docs/SEMINAR_VALIDATION_2026-09-24.md). Ниже сохранён отчёт/порядок предыдущей версии.

Дата подготовки: 11 сентября 2026. Код проверяется на Node.js 24.19.0 / Linux.

Чистая установка из распакованного ZIP: npm ci завершён успешно (344 пакета). Выполнены lint, JS syntax/security scan, SQL validation и production build. package.json/package-lock согласованы. Архив исключает node_modules, dist, .env, .git и приватные ключи. Сверка с исходными секретами не выявила их значений в выдаваемых исходниках.

Проверены 44 автоматических теста: unit, HTTP integration Express, PostgreSQL/RLS/RPC через PGlite и миграция исходной схемы. Проверена повторная генерация PDF (одинаковые байты), одна страница A4 landscape, встроенная кириллица, длинные ФИО/название, отсутствие часов и полная кликабельная verification URL. Выполнен визуальный просмотр PDF.

SQL full_schema.sql и migrate_existing_database.sql исполняются в локальном PostgreSQL-движке; повторная миграция сохраняет записи. Read-only verify_database.sql проверен на мигрированной исходной схеме: FAIL отсутствуют. Это не подтверждение состояния вашей удалённой Supabase.

После обновления npm audit сообщил 0 известных уязвимостей. Это состояние базы advisories на момент проверки, не гарантия отсутствия неизвестных проблем. React Router обновлён до 7.18.3, Vite — 8.3.0; React остаётся 18.3.1, react-is согласован с ним.

Не удалось проверить реальные параллельные PostgreSQL-соединения: в среде нет отдельного сервера PostgreSQL/Docker и TEST_DATABASE_URL. Не удалось проверить Supabase Auth/Storage/SMTP, перенос старых данных, production reverse proxy и пользовательский end-to-end: нет настроенного тестового проекта/его серверного ключа. Реальные секреты из исходного ZIP для подключения к пользовательским сервисам не использовались.

Выполните у себя:

- `npm run test:concurrency` после запуска disposable PostgreSQL из compose.test.yml и задания TEST_DATABASE_URL/ALLOW_TEST_WRITES.
- `npm run test:supabase` с TEST_SUPABASE_URL/TEST_SUPABASE_ANON_KEY.
- Ручные сценарии из TESTING.md, включая две сессии одного аккаунта, reset-password и приватные файлы.
- `k6 run tests/integration/load.k6.js` только на staging. Нагрузочные p95/throughput здесь не измерялись.

Windows .bat предоставлены, но на Windows не исполнялись. Bash-скрипты проверены синтаксически. Nginx/systemd — шаблоны конфигурации, не развёрнутый сервер. Приложение требует заполнения .env по новому примеру и применения SQL; без этого нельзя объявлять удалённую систему production-ready.

Вывод проверок: docs/validation-output.txt. Итоговый npm audit JSON: docs/npm-audit.json. Исходный код, проверенный после распаковки, соответствует коду итогового архива; дополнены только отчёты о выполнении.
