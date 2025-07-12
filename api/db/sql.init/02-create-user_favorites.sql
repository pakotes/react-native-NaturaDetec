CREATE TABLE IF NOT EXISTS user_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxon_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, taxon_id)
);

-- Índices para melhorar performance
-- (UNIQUE(user_id, taxon_id) já cria índice implícito)
CREATE INDEX IF NOT EXISTS idx_user_favorites_created_at ON user_favorites(created_at);