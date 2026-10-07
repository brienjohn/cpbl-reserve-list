CREATE TABLE IF NOT EXISTS picks (
  team TEXT NOT NULL,
  voter TEXT NOT NULL,
  ids TEXT NOT NULL,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team, voter)
);
CREATE INDEX IF NOT EXISTS picks_ip ON picks (team, ip_hash, created_at);
-- One row per team with the running totals, so reading stats costs one row.
CREATE TABLE IF NOT EXISTS tally (
  team TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  counts TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
