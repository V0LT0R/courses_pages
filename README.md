# AQUAGEO.KZ — seminars platform

React + Vite frontend and Express + PostgreSQL backend for seminar pages, admin/user cabinet, seminar management and PDF materials.

## What is included
- Public seminar catalog and seminar detail pages.
- Admin/user cabinet with seminar creation and editing.
- PostgreSQL-backed seminars and users.
- PDF upload in the seminar form.
- PDF replacement while editing an existing seminar.
- PDF viewer on the seminar detail page and in the materials archive.

## Run locally

1. Install dependencies:
```bash
npm install
```

2. Set `.env`:
```env
PORT=4000
DATABASE_URL=postgresql://postgres:123@localhost:5432/aquageo_seminars
JWT_SECRET=change_me
VITE_API_URL=http://localhost:4000/api
```

3. Start backend:
```bash
npm run server
```

4. Start frontend in a second terminal:
```bash
npm run dev
```

Frontend opens on `http://localhost:5173`, backend API works on `http://localhost:4000`.

## Initial data

Create admin:
```bash
npm run seed:admin
```

Seed example seminars:
```bash
npm run seed:seminars
```

## PDF upload

In the cabinet, open **Создать семинар** or **Редактировать**. In the **PDF файл семинара** block choose a `.pdf` file. The backend saves it to:

```text
server/uploads/pdfs/
```

The seminar stores the file path in PostgreSQL in `seminars.pdf_url`. Uploaded files are served through:

```text
http://localhost:4000/uploads/pdfs/<file-name>.pdf
```

Default upload limit is 25 MB. You can change it in `.env`:

```env
MAX_PDF_UPLOAD_MB=50
```

## Build
```bash
npm run build
```
