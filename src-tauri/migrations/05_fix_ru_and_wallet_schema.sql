-- Migration 5: Corrige o schema das tabelas ru_menus e student_wallet
-- para o formato JSON usado em ru-wallet.service.ts, garantindo persistência
-- permanente em disco entre reinicializações do app.

DROP TABLE IF EXISTS ru_menus;
CREATE TABLE ru_menus (
    campus TEXT NOT NULL,
    date TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (campus, date)
);

DROP TABLE IF EXISTS student_wallet;
CREATE TABLE student_wallet (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
