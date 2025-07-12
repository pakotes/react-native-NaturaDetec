CREATE TABLE IF NOT EXISTS user_species_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taxon_id INTEGER NOT NULL,
  action TEXT NOT NULL, -- Ex: 'view', 'favorite'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhorar performance (consultas frequentes por user_id)
CREATE INDEX IF NOT EXISTS idx_user_species_history_user_id ON user_species_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_species_history_taxon_id ON user_species_history(taxon_id);
CREATE INDEX IF NOT EXISTS idx_user_species_history_action ON user_species_history(action);
CREATE INDEX IF NOT EXISTS idx_user_species_history_created_at ON user_species_history(created_at);

-- Índice composto para consultas específicas
CREATE INDEX IF NOT EXISTS idx_user_species_user_action ON user_species_history(user_id, action);