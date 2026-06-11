# AQUAGEO.KZ — Supabase seminars platform

React + Vite platform for seminars/courses in a Coursera-like structure. The project now uses Supabase for Auth, Postgres database, Row Level Security and Storage for PDF/image materials.

## Main features

- Student registration with email, password and full name.
- Email uniqueness check before registration through Supabase RPC.
- Roles: `admin`, `manager`, `student`.
- Students cannot see course management/admin tabs.
- Student cabinet: profile editing and list of enrolled seminars.
- Admin cabinet: manager creation and user list.
- Manager cabinet: create and edit own seminars.
- Course structure: sections with content blocks in any order.
- Supported content blocks: text, YouTube link, PDF file, image/photo.
- YouTube links are rendered as embedded video players.
- PDF files and images are uploaded to Supabase Storage and displayed inside the course page.
- A student marks every section as completed using the “Ознакомлен с разделом” button.
- After all sections are completed, the “Получить сертификат” button appears.
- Certificate generation is connected to `https://nic-certificate-service.onrender.com` through the local backend endpoint `POST /api/certificates/generate`, which proxies the external endpoint `POST /api/v1/certificates/issue`. The frontend never sends the certificate API key directly.
- The generated payload contains `external_user_id`, `full_name`, `course_id`, `course_name`, `course_type`, `course_duration_hours`, `score: 100`, `completed_at`, and `language: ru`; the response fields `certificate_number`, `verify_url`, `pdf_url`, `tx_hash`, `issued_at`, and `status` are returned to the page and saved in `certificate_requests.payload`.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from example:

```bash
cp .env.example .env
```

3. Fill in the local backend, database, Supabase and certificate-service settings:

```env
VITE_API_URL=http://localhost:4000/api
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/aquageo_courses
JWT_SECRET=change-this-secret
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
CERTIFICATE_SERVICE_BASE_URL=https://nic-certificate-service.onrender.com
CERTIFICATE_SERVICE_API_KEY=your-certificate-service-api-key
```

4. In Supabase SQL Editor run:

```text
supabase/schema.sql
```

5. In Supabase Auth settings disable required email confirmation if you want registration to log users in immediately.

6. Create the first admin:

- Register normally on `/signup`.
- Run this SQL in Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

7. Deploy the Edge Function for creating managers:

```bash
supabase functions deploy create-manager
```

The function code is located here:

```text
supabase/functions/create-manager/index.ts
```

8. Run the frontend and backend together:

```bash
npm run dev:full
```

Or run them in two terminals:

```bash
npm run server
npm run dev
```

The certificate button calls the local backend at `http://localhost:4000/api/certificates/generate`, so the backend must be running.

## Important Supabase Storage note

The SQL file creates a public Storage bucket named `course-files` for PDF and image materials. Managers and admins can upload PDF/image files. Students can open material URLs after they get access to course content through enrollment.

If you already ran the old schema before image blocks were added, run the updated `supabase/schema.sql` again in SQL Editor. It adds the `image` content block type and updates the Storage bucket allowed MIME types.

## Build

```bash
npm run build
```


## Certificate service integration

The button **«Получить сертификат»** now sends the certificate request through the project backend:

1. Frontend calls `POST /api/certificates/generate`.
2. Backend adds the Bearer API key from `.env` and calls the external certificate service.
3. Backend calls `POST /api/v1/certificates/issue` on the external certificate service.
4. The score is always sent as `100` because seminar/course grading is not implemented yet.
5. After a successful response, the page shows **Скачать PDF** and **Открыть проверку** buttons.
6. The request and external service response are stored in `certificate_requests.payload`.

Required backend `.env` values:

```env
CERTIFICATE_SERVICE_BASE_URL=https://nic-certificate-service.onrender.com
CERTIFICATE_SERVICE_API_KEY=your-certificate-service-api-key
CERTIFICATE_SERVICE_PATHS=/api/v1/certificates/issue,/certificates,/certificates/issue,/certificates/generate,/api/certificates
```

The exact Swagger endpoint is already placed first in `CERTIFICATE_SERVICE_PATHS`.

Run both parts locally:

```bash
npm install
npm run dev:full
```

If you see `ERR_CONNECTION_REFUSED` for `http://localhost:4000/api/...`, it means the backend process is not running or it failed to start because `DATABASE_URL` is missing/incorrect.
