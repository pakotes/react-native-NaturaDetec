-- Criar tabela documents para sistema RAG com UPSERT (apenas se não existir)
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    taxon_id TEXT UNIQUE NOT NULL,
    nome_cientifico TEXT,
    content TEXT,
    embedding vector(768),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhorar performance (pesquisas RAG)
CREATE INDEX IF NOT EXISTS idx_documents_taxon_id ON documents(taxon_id);
CREATE INDEX IF NOT EXISTS idx_documents_nome_cientifico ON documents(nome_cientifico);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Criar trigger apenas se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_documents_updated_at'
    ) THEN
        CREATE TRIGGER update_documents_updated_at
            BEFORE UPDATE ON documents
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;