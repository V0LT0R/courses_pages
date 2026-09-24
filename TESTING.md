# Проверка проекта

## Локальные проверки без Supabase

```text
npm ci
npm run preflight
npm run lint
npm test
npm run sql:check
npm run build
```

`npm run verify:release` запускает эти проверки кроме установки. `npm test` проверяет:

- Unit: URL/UUID/filename, public whitelist, валидация регистрации и менеджеров, MIME/signatures, сообщения, CORS/rate limiter, HTML escaping, детерминированные PDF.
- HTTP integration: настоящие Express HTTP-запросы; gateway подменён тестовым объектом. Проверяются 401, 403, CORS, лимиты, подмена клиентских полей, отсутствие приватных данных, 20 одновременных PDF-запросов.
- Database integration: настоящий встроенный PostgreSQL через PGlite. Таблицы, RLS, роли, RPC, бизнес-инварианты, просроченный тест, повторная выдача, неизменяемые снимки, конфликт редактора и миграция предыдущей схемы.

PGlite выполняет PostgreSQL SQL/PLpgSQL, но использует одно соединение. Повторные вызовы в нём проверяют идемпотентность, **не межсоединенческую конкуренцию**. Таблицы Auth/Storage в harness минимальные; проверка реального Supabase Gateway/JWT/Storage/SMTP выполняется отдельно. В harness пропускается CREATE EXTENSION pgcrypto, потому что gen_random_uuid встроена в PostgreSQL.

## Настоящие параллельные PostgreSQL-соединения

Нужен Docker или отдельная тестовая PostgreSQL, уже содержащая схему. Скрипт создаёт случайные тестовые аккаунты/курс, выполняет сценарии и удаляет только собственные fixtures. Никогда не направляйте его на production.

```text
docker compose -f compose.test.yml up -d --wait
```

Linux/macOS:

```sh
TEST_DATABASE_URL=postgresql://postgres:local_disposable_test_only@127.0.0.1:55432/aquageo_test ALLOW_TEST_WRITES=YES npm run test:concurrency
```

Windows PowerShell:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:local_disposable_test_only@127.0.0.1:55432/aquageo_test'
$env:ALLOW_TEST_WRITES='YES'
npm run test:concurrency
```

После проверки: `docker compose -f compose.test.yml down`. Данные этого контейнера временные. Скрипт использует до 24 отдельных соединений, `SET LOCAL ROLE authenticated` и независимые auth.uid claims. Сценарии: A — 20 записей на курс/1 строка; B — 20 отметок/1 строка; C — 10 стартов/1 попытка; D — две одновременные сдачи/одна отклонена; H — 20 выдач/1 номер; два редактора с одним timestamp/один конфликт. E/F/G/I/J/K проверяются локальными database/HTTP тестами. Настоящее подтверждение JWT разных сессий — следующим этапом.

## Supabase smoke и ручной end-to-end

Заполните TEST_SUPABASE_URL и TEST_SUPABASE_ANON_KEY тестового проекта:

```text
npm run test:supabase
```

Smoke должен не просто увидеть ошибку, а различить deny от отсутствующей функции. Проверьте также SQL PASS/FAIL.

1. Admin создаёт курс с PDF/картинкой, разделом и 5 вопросами; сохраняет, затем повторно открывает редактор. Student не видит редактор; прямой admin RPC от его JWT отклоняется.
2. Откройте два разных профиля браузера с двумя входами в один student аккаунт. Одновременно запишитесь на курс, отметьте раздел и начните тест. В БД должна быть одна enrollment, одна progress и одна active attempt.
3. Подмените локальный таймер; дождитесь серверного expires_at. Сдача должна вернуть timed_out=true, passed=false. Повторный submit завершённого attempt должен отклоняться.
4. Нельзя получить ответы из test_question_answers; option другого вопроса, чужой attempt и duplicate question_id отклоняются. Student A не может писать progress B или score/passed через REST.
5. Успешно пройдите тест. Запросите сертификат 20 раз; номера одинаковы. Обновите страницу и откройте «Мои сертификаты». Измените имя и заголовок курса: уже выданные сертификат/PDF не меняются.
6. Откройте публичную проверку в режиме инкогнито: видны номер, ФИО, семинар, результат, дата и PDF; нет email/internal user UUID. Проверьте QR и все прежние номера после импорта.
7. Для private course-files попытка анонимного чтения не получает файл; student без enrollment не может получить signed URL. Уже выданная подписанная ссылка работает до своего срока, это ожидаемо. Manager upload HTML под расширением .pdf должен отклоняться. Прямой upload в Storage от manager JWT должен быть запрещён.
8. Отзовите тестовый сертификат SQL-командой `update public.certificates set status='revoked' where certificate_number='TEST_NUMBER';`. Онлайн-проверка должна показать отзыв. Ранее скачанный PDF сохраняется.
9. Проверьте signup/email confirmation/reset-password, истёкший JWT (401), logout/login другим аккаунтом в той же вкладке, обновление сессии, отсутствие материалов предыдущего пользователя. Встроенный лимитер не заменяет лимиты Supabase Auth.
10. Два менеджера/админ редактируют одну версию курса: второй видит понятный конфликт, первая редакция не теряется.

## Нагрузочная проверка k6

`tests/integration/load.k6.js`: 5 VU, 20 секунд, 5 секунд паузы. Обязательны ALLOW_STAGING_LOAD=YES, STAGING_APP_URL, STAGING_SUPABASE_URL, STAGING_ANON_KEY. Опциональны CERTIFICATE_NUMBER, STAGING_STUDENT_JWT и FIXTURE_COURSE_ID (предварительно пройти разделы fixture-курса). Эти секреты передавайте через окружение, не сохраняйте в отчёт.

```text
k6 run tests/integration/load.k6.js
```

Это начальный smoke нагрузки, не доказательство целевой пропускной способности. Порог p95 < 1500 ms — измеряемый критерий теста, не обещание. Зафиксируйте регион, тариф, RTT, число реплик, CPU/RAM и квоты БД; увеличивайте нагрузку только на staging. Не запускайте destructive load на production.
