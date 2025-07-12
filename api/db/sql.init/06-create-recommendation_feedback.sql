-- Tabela para armazenar feedback sobre recomendações
CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    recommended_taxon_id INTEGER NOT NULL,
    feedback_type VARCHAR(50) NOT NULL, -- 'liked', 'disliked', 'not_relevant', 'already_known'
    algorithm_used VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user_id ON recommendation_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_taxon_id ON recommendation_feedback(recommended_taxon_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_algorithm ON recommendation_feedback(algorithm_used);
CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_created_at ON recommendation_feedback(created_at);

-- Índice composto para consultas específicas
CREATE INDEX IF NOT EXISTS idx_feedback_user_algorithm ON recommendation_feedback(user_id, algorithm_used);
