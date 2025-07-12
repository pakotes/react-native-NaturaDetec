-- Tabela para armazenar avaliações de espécies pelos usuários
CREATE TABLE IF NOT EXISTS species_ratings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    taxon_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, taxon_id) -- Um usuário pode avaliar uma espécie apenas uma vez
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_species_ratings_user_id ON species_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_species_ratings_taxon_id ON species_ratings(taxon_id);
CREATE INDEX IF NOT EXISTS idx_species_ratings_rating ON species_ratings(rating);
CREATE INDEX IF NOT EXISTS idx_species_ratings_created_at ON species_ratings(created_at);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_species_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar updated_at
CREATE TRIGGER update_species_ratings_updated_at
    BEFORE UPDATE ON species_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_species_ratings_updated_at();
