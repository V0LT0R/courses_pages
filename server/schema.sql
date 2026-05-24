CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seminars (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  date_text TEXT NOT NULL,
  duration TEXT NOT NULL,
  format TEXT NOT NULL,
  location TEXT NOT NULL,
  image_url TEXT NOT NULL,
  short_description TEXT NOT NULL,
  description TEXT NOT NULL,
  outcomes TEXT[] NOT NULL DEFAULT '{}',
  lecturer_name TEXT NOT NULL,
  lecturer_role TEXT NOT NULL,
  lecturer_bio TEXT NOT NULL,
  lecturer_photo TEXT NOT NULL,
  certificate BOOLEAN NOT NULL DEFAULT TRUE,
  rating NUMERIC(2,1) NOT NULL DEFAULT 5.0,
  pdf_url TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seminars_created_by ON seminars(created_by);
