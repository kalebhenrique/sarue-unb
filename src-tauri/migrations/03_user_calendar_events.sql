-- Migration 3: User Calendar Events Table
-- Consolida a tabela de eventos pessoais do calendário nas migrações nativas do SQLite.
-- ATENÇÃO: NUNCA edite arquivos de migração já publicados (01, 02, 03...), pois o
-- tauri-plugin-sql (sqlx) valida o checksum SHA-384 de cada versão aplicada no cliente.
-- Sempre crie um novo arquivo numerado (04_*.sql) para alterações futuras.

CREATE TABLE IF NOT EXISTS user_calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  end_date TEXT,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL,
  course_id TEXT,
  course_code TEXT,
  course_name TEXT,
  location TEXT,
  notify INTEGER NOT NULL DEFAULT 1,
  is_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_calendar_events_date ON user_calendar_events(date);
