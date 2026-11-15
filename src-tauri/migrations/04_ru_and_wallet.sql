CREATE TABLE IF NOT EXISTS ru_menus (
    campus TEXT NOT NULL,
    date TEXT NOT NULL,
    breakfast_json TEXT NOT NULL DEFAULT '[]',
    lunch_json TEXT NOT NULL DEFAULT '[]',
    dinner_json TEXT NOT NULL DEFAULT '[]',
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (campus, date)
);

CREATE TABLE IF NOT EXISTS student_wallet (
    matricula TEXT PRIMARY KEY,
    ru_token TEXT,
    ru_valid_until TEXT,
    ru_balance REAL,
    ru_group INTEGER,
    ru_entries_json TEXT NOT NULL DEFAULT '[]',
    cpf TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
