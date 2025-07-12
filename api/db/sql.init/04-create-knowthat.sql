
-- Garantir encoding UTF-8
SET client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS knowthat (
   id      integer PRIMARY KEY,
   action  text     NOT NULL,
   taxon_id integer  -- ID da espécie para link direto
);

INSERT INTO knowthat (id, action, taxon_id) VALUES
  (1, 'A azinheira (Quercus rotundifolia), típica do montado alentejano, pode viver mais de 500 anos e é fundamental para a biodiversidade e produção de bolota?', 82946),
  (2, 'A borboleta-cauda-de-andorinha (Papilio machaon) é uma das mais belas de Portugal e pode ser vista em jardins e zonas rurais durante a primavera e o verão?', 56529),
  (3, 'O osga-comum (Tarentola mauritanica), apesar da aparência pré-histórica, é inofensivo e ajuda a controlar insetos em muitas casas portuguesas?', 33602),
  (4, 'O grifo (Gyps fulvus), uma das maiores aves de rapina da Europa, nidifica em escarpas do Douro Internacional e pode ter uma envergadura de até 2,8 metros?', 5366),
  (5, 'A rã verde-ibérica (Pelophylax perezi), comum em charcos e rios de Portugal, canta principalmente à noite e serve de bioindicador da qualidade da água?', 66331),
  (6, 'A esteva (Cistus ladanifer), típica do sul de Portugal, exala um aroma intenso e é usada na produção de perfumes devido à resina chamada lábdano?', 76362),
  (7, 'A raposa-vermelha (Vulpes vulpes) é o carnívoro selvagem mais comum em Portugal e adapta-se facilmente tanto a zonas florestais como a ambientes urbanos?', 42069),
  (8, 'O roaz-corvineiro (Tursiops truncatus), um tipo de golfinho, habita o estuário do Sado e é uma das poucas populações residentes na Europa?', 41482),
  (9, 'O sobreiro (Quercus suber) é a árvore nacional de Portugal e a sua cortiça é extraída sem causar danos à árvore, regenerando-se naturalmente?', 50868),
  (10, 'A lagartixa-do-mato (Psammodromus algirus) é endémica da Península Ibérica e distingue-se pelas suas escamas quilhadas e listras amarelas?', 35519)
ON CONFLICT (id) DO NOTHING;