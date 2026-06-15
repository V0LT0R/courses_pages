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
- Certificate generation is integrated locally from `nic_cers`: the frontend calls the project backend endpoint `POST /api/certificates/generate`; the backend signs the certificate, stores it in PostgreSQL, returns printable certificate/verification links, and does not call an external certificate API.
- The generated payload contains `external_user_id`, `full_name`, `course_id`, `course_name`, `course_type`, `course_duration_hours`, `score: 100`, `completed_at`, and `language: ru`; the response fields `certificate_number`, `verify_url`, `pdf_url`, `json_url`, `tx_hash`, `issued_at`, `status`, and `data_hash` are returned to the page and saved in `certificate_requests.payload`.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from example:

```bash
cp .env.example .env
```

3. Fill in the local backend, database, Supabase and local certificate settings:

```env
VITE_API_URL=http://localhost:4000/api
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/aquageo_courses
JWT_SECRET=change-this-secret
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
CERT_PREFIX=NIC
CERT_PROJECT=WATER
CERT_BASE_URL=http://localhost:4000
ISSUER_NAME="NIC Research Center"
ISSUER_URL=https://nic.kz
ED25519_PRIVATE_KEY=your-raw-ed25519-private-key-base64
ED25519_PUBLIC_KEY=your-raw-ed25519-public-key-base64
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


## Integrated certificate generation

The button **«Получить сертификат»** now works without the external NIC API:

1. Frontend calls `POST /api/certificates/generate`.
2. Backend normalizes the course completion payload.
3. Backend creates a certificate number in the `NIC-WATER-YEAR-RANDOM` format.
4. Backend builds a W3C-VC-style signed JSON document using Ed25519 logic adapted from `nic_cers`.
5. Backend stores the certificate in `local_certificate_records`.
6. The page shows **Скачать PDF** and **Открыть проверку** buttons. The “PDF” link returns a generated PDF file with a QR code that points to the verification page.
7. The request and local certificate response are also stored in Supabase `certificate_requests.payload`.

Useful local endpoints:

```text
POST /api/certificates/generate
GET  /verify/:certificateNumber
GET  /api/v1/verify/:certificateNumber
GET  /api/certificates/:certificateNumber/json
GET  /api/certificates/:certificateNumber/pdf
GET  /issuer.json
```

Run both parts locally:

```bash
npm install
npm run dev:full
```

If you see `ERR_CONNECTION_REFUSED` for `http://localhost:4000/api/...`, it means the backend process is not running or it failed to start because `DATABASE_URL` is missing/incorrect.
