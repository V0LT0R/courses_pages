# Развёртывание

Поддерживаемая конфигурация: статический `dist/` + Express Node.js 22.12+ + Supabase, за единым HTTPS-доменом. Это не приложение, которое достаточно загрузить целиком на статический хостинг: backend необходим для PDF, загрузок и создания менеджеров.

1. Выполните миграцию и тесты по MIGRATION_GUIDE/TESTING.
2. На сборочном сервере задайте только публичные VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL=/api. `npm ci` → `npm run verify:release`. Содержимое `dist` разместите в `/srv/aquageo/dist`. Не помещайте `.env`, SQL, исходники или node_modules в web root.
3. На Node backend задайте SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NODE_ENV=production, HOST=127.0.0.1, PORT=4000, PUBLIC_APP_URL=https://courses.example.com, CERT_BASE_URL с тем же origin, CORS_ORIGINS с точным origin. При одном доверенном Nginx задайте TRUST_PROXY=1. Backend может устанавливаться `npm ci --omit=dev` после выполненной сборки; `npm start` запускает только API.
4. Используйте выделенного непривилегированного пользователя и supervisor. `deploy/aquageo.service.example` — шаблон systemd; уточните путь Node и владельца `/etc/aquageo/backend.env`, ограничьте доступ к секретам. Приложение не пишет файлы на диск при обычной работе.
5. `deploy/nginx.conf.example` показывает /api, /verify, /health, /readiness на Node и SPA fallback для остальных маршрутов. Укажите свой домен/TLS-сертификаты. Проверьте `nginx -t` перед reload. Для другого hosting/CDN настройте эквивалентные rewrites. HTTPS-сертификат и DNS не создаются исходным кодом.
6. В Supabase Auth задайте production Site URL и точный `/reset-password` redirect, подтверждение email, SMTP и защиту от злоупотреблений. Укажите организацию в public.app_settings. Не выставляйте course-files public.
7. `/health` — процесс отвечает; `/readiness` — Supabase RPC возвращает aquageo-2. Проверяйте оба endpoint снаружи. Далее ручные smoke-тесты: вход, файл, обучение, тест, повторная выдача, PDF и QR.

Статусы логов структурированы JSON: requestId, метод, route pattern, HTTP status, durationMs; ошибки содержат код, без JWT/паролей/тел запросов. Собирайте stdout/stderr в централизованный журнал с контролем доступа и retention. Отслеживайте 5xx/429, время readiness, p95 latency, память и Supabase quotas. В БД audit_log сохраняет actor/action/table/entity/time, course_revisions — предыдущие редакции. Встроенного внешнего оповещения/дашборда мониторинга нет.

Храните backup Supabase и Storage раздельно, проверяйте восстановление. Повторный запуск Node не выполняет DDL: миграции запускаются администратором отдельно. Нельзя считать /health доказательством применённой схемы.

При смене домена настройте сохранение прежних verification URL. Старый PDF неизменяем; переиздание другого PDF под тем же номером без процедуры миграции не выполняется. Для публичной проверки желательно один стабильный домен на весь срок хранения сертификатов.
