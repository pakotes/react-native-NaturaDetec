// ==========================
// 1. DEPENDÊNCIAS E CONFIG
// ==========================
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');
const { io } = require("socket.io-client");

const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());
const upload = multer();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000
});

const transporter = nodemailer.createTransport({
  host: 'smtp',
  port: 1025,
  ignoreTLS: true
});

const JWT_SECRET = process.env.JWT_SECRET;
const INATURE_API = process.env.URL_PUBLIC_INATURE;
const GROUPS = [
  { id: 'Aves', label: 'Aves', icon: 'taxon_aves', color: '#2196F3', ancestor_ids: [3] },
  { id: 'Amphibia', label: 'Anfíbios', icon: 'taxon_amphibia', color: '#4CAF50', ancestor_ids: [20978] },
  { id: 'Reptilia', label: 'Répteis', icon: 'taxon_reptilia', color: '#795548', ancestor_ids: [26036] },
  { id: 'Mammalia', label: 'Mamíferos', icon: 'taxon_mammalia', color: '#FF9800', ancestor_ids: [40151] },
  { id: 'Actinopterygii', label: 'Peixes', icon: 'taxon_actinopterygii', color: '#00BCD4', ancestor_ids: [47178] },
  { id: 'Arachnida', label: 'Aracnídeos', icon: 'taxon_arachnida', color: '#9C27B0', ancestor_ids: [47119] },
  { id: 'Insecta', label: 'Insetos', icon: 'taxon_insecta', color: '#8BC34A', ancestor_ids: [47158] },
  { id: 'Mollusca', label: 'Moluscos', icon: 'taxon_mollusca', color: '#E91E63', ancestor_ids: [47686] },
  { id: 'Plantae', label: 'Plantas', icon: 'taxon_plantae', color: '#66BB6A', ancestor_ids: [47126] },
];
const IDENTIFY_SPECIES_DIR = process.env.IDENTIFY_SPECIES_DIR
const IA_SERVICE_URL = process.env.IA_SERVICE_URL || 'http://ia_service:8000';

// ==========================
// 2. FUNÇÕES AUXILIARES PARA ESPÉCIES
// ==========================

// Função auxiliar para buscar dados de taxa da API iNaturalist com retry
async function fetchTaxaData(taxonIds) {
  try {
    const batchSize = 5;
    const allResults = [];

    for (let i = 0; i < taxonIds.length; i += batchSize) {
      const batch = taxonIds.slice(i, i + batchSize);
      const url = `${INATURE_API}taxa?${batch.map(id => `id=${id}`).join('&')}&locale=pt`;

      // Verificar comprimento da URL
      if (url.length > 1000) {
        console.warn(`URL muito longa detectada em fetchTaxaData (${url.length} chars), processando individualmente...`);
        // Processar um por vez
        for (const taxonId of batch) {
          const singleUrl = `${INATURE_API}taxa?id=${taxonId}&locale=pt`;
          try {
            const singleData = await fetchFromiNaturalist(singleUrl);
            if (singleData.results && Array.isArray(singleData.results)) {
              allResults.push(...singleData.results);
            }
          } catch (singleError) {
            console.error(`Erro ao buscar taxon individual ${taxonId}:`, singleError.message);
          }
        }
      } else {
        const batchData = await fetchFromiNaturalist(url);
        if (batchData.results && Array.isArray(batchData.results)) {
          allResults.push(...batchData.results);
        }
      }

      // Pequena pausa entre batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { results: allResults };
  } catch (error) {
    console.error('Erro ao procurar dados de taxa:', error.message);
    return { results: [] };
  }
}

// Função auxiliar para fazer chamadas robustas à API iNaturalist
async function fetchFromiNaturalist(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Verificar se a URL não é muito longa
      if (url.length > 2000) {
        throw new Error(`URL muito longa (${url.length} caracteres). Máximo recomendado: 2000`);
      }

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SpeciesApp/1.0',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      // Verificar se a resposta é válida
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP ${response.status}: ${response.statusText}`, {
          url,
          responsePreview: errorText.substring(0, 300)
        });
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Verificar se a resposta é JSON
      const contentType = response.headers.get('content-type') || '';
      const responseText = await response.text();

      if (!contentType.includes('application/json')) {
        console.error(`Resposta não é JSON na tentativa ${attempt}:`, {
          contentType,
          url,
          responsePreview: responseText.substring(0, 300)
        });

        // Se for XML, pode ser erro de servidor temporário
        if (responseText.startsWith('<?xml')) {
          console.warn(`API retornou XML na tentativa ${attempt}, aguardando antes de tentar novamente...`);
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 3000 * attempt)); // Aumentar tempo de espera
            continue;
          } else {
            throw new Error(`API continua retornando XML após ${retries} tentativas. Pode ser instabilidade temporária.`);
          }
        }

        if (attempt === retries) {
          throw new Error(`API retornou ${contentType} em vez de JSON. Resposta: ${responseText.substring(0, 200)}`);
        }
        continue;
      }

      // Tentar fazer parse do JSON
      try {
        const data = JSON.parse(responseText);
        return data;
      } catch (parseError) {
        console.error(`Erro ao fazer parse do JSON na tentativa ${attempt}:`, {
          parseError: parseError.message,
          url,
          responsePreview: responseText.substring(0, 300)
        });

        if (attempt === retries) {
          throw new Error(`Erro ao fazer parse do JSON: ${parseError.message}`);
        }
        continue;
      }

    } catch (error) {
      console.error(`Erro na tentativa ${attempt}/${retries}:`, error.message);

      if (attempt === retries) {
        throw error;
      }

      // Aguardar mais tempo entre tentativas para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
    }
  }
}

// Função para buscar famílias em batch
async function fetchFamiliesInBatch(taxonIds) {
  try {
    const batchSize = 3; // Reduzido para evitar URLs muito longas
    const families = {};

    for (let i = 0; i < taxonIds.length; i += batchSize) {
      const batch = taxonIds.slice(i, i + batchSize);
      const url = `${INATURE_API}taxa?${batch.map(id => `id=${id}`).join('&')}&all_names=true&locale=pt`;

      // Verificar se a URL não é muito longa antes de fazer a requisição
      if (url.length > 800) { // Reduzido o limite
        console.warn(`URL ainda muito longa (${url.length} chars), processando um por vez...`);
        // Processar um por vez se ainda estiver muito longo
        for (const taxonId of batch) {
          const singleUrl = `${INATURE_API}taxa?id=${taxonId}&all_names=true&locale=pt`;
          try {
            const singleData = await fetchFromiNaturalist(singleUrl);
            if (singleData.results && Array.isArray(singleData.results) && singleData.results.length > 0) {
              const taxon = singleData.results[0];
              let family = null;
              if (taxon.ancestors && Array.isArray(taxon.ancestors)) {
                const familyAncestor = taxon.ancestors.find(ancestor => ancestor.rank === 'family');
                if (familyAncestor) {
                  family = familyAncestor.name;
                }
              }
              families[taxon.id] = family;
            }
          } catch (singleError) {
            console.error(`Erro ao buscar taxon ${taxonId}:`, singleError.message);
            families[taxonId] = null; // Definir como null para não tentar novamente
          }

          // Pequena pausa para não sobrecarregar a API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        continue;
      }

      try {
        const data = await fetchFromiNaturalist(url);

        if (data.results && Array.isArray(data.results)) {
          data.results.forEach(taxon => {
            if (taxon.id) {
              // Buscar família nos ancestors
              let family = null;
              if (taxon.ancestors && Array.isArray(taxon.ancestors)) {
                const familyAncestor = taxon.ancestors.find(ancestor => ancestor.rank === 'family');
                if (familyAncestor) {
                  family = familyAncestor.name;
                }
              }

              families[taxon.id] = family;
            }
          });
        }
      } catch (batchError) {
        console.error(`Erro no batch ${i}-${i + batchSize}:`, batchError.message);
        // Continuar com o próximo batch mesmo na falha de um
      }

      // Pequena pausa entre batches para evitar rate limiting
      if (i + batchSize < taxonIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return families;
  } catch (error) {
    console.error('Erro ao buscar famílias:', error);
    return {};
  }
}

// Função para mapear os dados de espécies com família e imagem
function mapSpeciesWithFamilyAndImage(item, families = {}) {
  const t = item.taxon;
  let pt_name = null;

  if (Array.isArray(t.taxon_names)) {
    const pt = t.taxon_names.find(
      n =>
        n.locale === 'pt' ||
        n.locale === 'pt-PT' ||
        n.locale === 'pt-BR' ||
        (n.lexicon && n.lexicon.toLowerCase().includes('portuguese'))
    );
    if (pt) pt_name = pt.name;
  }

  // Buscar família: primeiro no mapeamento, depois no campo direto
  let family = families[t.id] || t.family || null;

  // Buscar imagens disponíveis
  let image_url = null;
  let image_square_url = null;
  let image_medium_url = null;

  if (t.default_photo) {
    image_square_url = t.default_photo.square_url || null;
    image_medium_url = t.default_photo.medium_url || null;
    // Para compatibilidade, mantém image_url como medium (melhor qualidade)
    image_url = image_medium_url || image_square_url || t.default_photo.original_url;
  }

  return {
    taxon_id: t.id,
    sci_name: t.name,
    common_name: pt_name || t.preferred_common_name || t.name,
    group: t.iconic_taxon_name || null,
    family: family,
    conservation_status: t.conservation_status?.status_name || null,
    image_url: image_url,
    image_square_url: image_square_url,
    image_medium_url: image_medium_url
  };
}

// ==========================
// 3. UTILITÁRIOS E MIDDLEWARES
// ==========================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ error: 'Token inválido.' });
    req.user = user;
    next();
  });
}

// ==========================
// 3. UTILIZADORES & AUTENTICAÇÃO
// ==========================

// Registo simples
app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }
  try {
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'E-mail já registado.' });
    }
    // Hash da senha antes de salvar
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Registo com foto (inclui guardar em known_faces)
app.post('/auth/register-with-photo', upload.single('photo'), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || !req.file) {
      return res.status(400).json({ error: 'Preencha todos os campos e envie uma foto.' });
    }
    // Verifique se o utilizador já existe
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'E-mail já registado.' });
    }

    // Hash da password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Redimensiona e comprime a imagem antes de guardar
    const resizedBuffer = await sharp(req.file.buffer)
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Duardar dados do utilizador na base de dados
    const result = await pool.query(
      'INSERT INTO users (name, email, password, photo) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
      [name, email, hashedPassword, resizedBuffer]
    );

    // Guardar a foto no diretório do ia_service
    const facesDir = process.env.KNOWN_FACES_DIR || '/app/known_faces';
    if (!fs.existsSync(facesDir)) {
      fs.mkdirSync(facesDir, { recursive: true });
    }
    const photoPath = path.join(facesDir, `${email}.jpg`);

    // Usa o buffer já criado para salvar a imagem
    fs.writeFileSync(photoPath, resizedBuffer);
    res.status(201).json({ message: 'Registo realizado com sucesso!' });

  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Registo facial batch (frames de vídeo ou várias fotos)
app.post('/auth/register-faces-batch', async (req, res) => {
  const { email, images } = req.body;
  if (!email || !images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Email e imagens são obrigatórios.' });
  }
  try {
    // Envia para o serviço IA para seleção e registo das melhores faces
    const response = await fetch(IA_SERVICE_URL + '/register_faces_batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, images }),
    });
    const status = response.status;
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Resposta inválida do IA_Service.' });
    }
    if (response.ok) {
      return res.json(data);
    } else {
      return res.status(status).json(data);
    }
  } catch (err) {
    console.error('Erro:', err.message);
    res.status(500).json({ error: 'Erro no registo facial batch.' });
  }
});

// Login por email/palavra-passe
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    const user = result.rows[0];

    // Verifica se a palavra-passe corresponde ao hash armazenado
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    // Converte a foto para base64 se existir
    let photoBase64 = null;
    if (user.photo) {
      photoBase64 = Buffer.from(user.photo).toString('base64');
    }
    // Gera o token JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ id: user.id, name: user.name, email: user.email, photo: photoBase64, token });
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Login por reconhecimento facial
app.post('/auth/face-login', upload.single('photo'), async (req, res) => {
  try {
    console.log('API - Recebido pedido de reconhecimento facial');
    if (!req.file) {
      return res.status(400).json({ error: 'Foto não enviada.' });
    }

    // Converta a imagem para base64
    const imageBase64 = req.file.buffer.toString('base64');
    console.log('API - Imagem recebida:', imageBase64.substring(0, 30) + '...');
    // Envie para o ai_service para reconhecimento facial
    const response = await fetch(IA_SERVICE_URL + '/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });

    const status = response.status;
    const text = await response.text();
    console.log('IA_Service:', text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Resposta inválida do IA_Service:' });
    }

    if (data.email) {
      // Procure o utilizador pelo email
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [data.email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Utilizador não encontrado.' });
      }
      const user = result.rows[0];

      let photoBase64 = null;
      if (user.photo) {
        photoBase64 = Buffer.from(user.photo).toString('base64');
      }

      // Gera o token JWT
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2h' });
      return res.json({ id: user.id, name: user.name, email: user.email, photo: photoBase64, token });
    } else {
      return res.status(401).json({ error: 'Face não reconhecida.' });
    }
  } catch (err) {
    console.error('Erro:', err.message);
    res.status(500).json({ err: 'Erro no reconhecimento facial.' });
  }
});

// Recuperação de palavra-passe (enviar email)
app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Preencha o campo de e-mail.' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    // Resposta genérica para não revelar se existe
    if (result.rows.length === 0) {
      return res.json({ message: 'Se o e-mail existir, você receberá instruções para redefinir a senha.' });
    }

    // Gerar token seguro
    //const token = crypto.randomBytes(32).toString('hex'); //simplificar para 6 para Prova de Conceito ISTEC
    const token = crypto.randomBytes(6).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Guardar token e expiração na BD
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [token, expires, email]
    );

    // Link de recuperação
    const resetLink = `http://localhost:3000/reset-password?token=${token}`;

    // Enviar email
    await transporter.sendMail({
      from: 'no-reply@myapppf.com',
      to: email,
      subject: 'Recuperação de senha',
      text: `Clique no link para redefinir sua senha: ${resetLink}`,
      html: `<b>Clique no link para redefinir sua senha:</b> <a href="${resetLink}">${resetLink}</a>`
    });

    res.json({ message: 'Se o e-mail existir, você receberá instruções para redefinir a senha.' });
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Redefinir a palavra-passe
app.post('/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token e nova palavra-passe são obrigatórios.' });
  }
  try {
    // Verifica se o token existe e se não expirou
    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido ou expirado.' });
    }
    const userId = result.rows[0].id;
    // Hash da nova palavra-passe
    const hashedPassword = await bcrypt.hash(password, 10);
    // Atualiza palavra-passe e remove o token
    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, userId]
    );
    res.json({ message: 'Palavra-passe alterada com sucesso.' });
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Perfil do utilizador autenticado
app.get('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, photo, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    const user = result.rows[0];
    let photoBase64 = null;
    if (user.photo) {
      photoBase64 = Buffer.from(user.photo).toString('base64');
    }
    res.json({ id: user.id, name: user.name, email: user.email, photo: photoBase64 });

  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Atualizar perfil (nome/palavra-passe)
app.put('/auth/profile', authenticateToken, async (req, res) => {
  const { name, password } = req.body;
  if (!name && !password) {
    return res.status(400).json({ error: 'Forneça pelo menos um campo para se atualizar.' });
  }
  try {
    let query = 'UPDATE users SET';
    const params = [];
    let idx = 1;

    if (name) {
      query += ` name = $${idx}`;
      params.push(name);
      idx++;
    }
    if (password) {
      if (params.length > 0) query += ',';
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ` password = $${idx}`;
      params.push(hashedPassword);
      idx++;
    }
    query += ` WHERE id = $${idx} RETURNING id, name, email`;
    params.push(req.user.id);

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Atualizar foto do perfil
app.post('/auth/profile/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Foto não enviada.' });
    }
    // Redimensiona e comprime a imagem antes de guardar
    const resizedBuffer = await sharp(req.file.buffer)
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    await pool.query(
      'UPDATE users SET photo = $1 WHERE id = $2',
      [resizedBuffer, req.user.id]
    );
    // Guardar a foto no diretório do ia_service
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const email = userResult.rows[0].email;
    const facesDir = process.env.KNOWN_FACES_DIR || '/app/known_faces';
    if (!fs.existsSync(facesDir)) {
      fs.mkdirSync(facesDir, { recursive: true });
    }
    const photoPath = path.join(facesDir, `${email}.jpg`);
    // Usa o buffer já criado para salvar a imagem
    fs.writeFileSync(photoPath, resizedBuffer);

    res.json({ message: 'Foto atualizada com sucesso!' });
  } catch (error) {
    console.error('Erro API:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remover foto do perfil
app.delete('/auth/profile/photo', authenticateToken, async (req, res) => {
  try {
    // 1. Remover a foto da base de dados
    await pool.query('UPDATE users SET photo = NULL WHERE id = $1', [req.user.id]);

    // 2. Remover ficheiros do diretório known_faces
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length > 0) {
      const email = userResult.rows[0].email;
      const facesDir = process.env.KNOWN_FACES_DIR || '/app/known_faces';
      const possibleExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      // Apaga todos os ficheiros que começam pelo email (incluindo _1, _2, etc)
      const files = fs.readdirSync(facesDir);
      files.forEach(file => {
        if (file.startsWith(email)) {
          fs.unlinkSync(path.join(facesDir, file));
        }
      });
    }
    res.json({ message: 'Foto removida com sucesso!' });
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Eliminar conta do utilizador
app.delete('/auth/delete-account', authenticateToken, async (req, res) => {
  try {
    // Apagar foto em known_faces, se existir
    const facesDir = process.env.KNOWN_FACES_DIR || path.join(__dirname, 'known_faces');
    const user = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length > 0) {
      const email = user.rows[0].email;
      const possibleExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      for (const ext of possibleExtensions) {
        const filePath = path.join(facesDir, `${email}.${ext}`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
    // Apagar utilizador da base de dados
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'Conta eliminada com sucesso.' });
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================
// 4. ESPÉCIES & GRUPOS
// ==========================

// Listar grupos/categorias
app.get('/api/groups', (req, res) => {
  const groups = GROUPS.map(group => ({
    id: group.id,
    name: group.id,      // <-- identificador interno (ex: 'mammals')
    label: group.label,  // <-- nome visível (ex: 'Mamíferos')
    icon: group.icon,
    color: group.color,
  }));
  res.json({ groups });
});

// Retorna um texto aleatório do bloco "Sabia que..."
app.get('/api/knowthat/random', async (req, res) => {
  try {
    const result = await pool.query('SELECT action, taxon_id FROM knowthat ORDER BY RANDOM() LIMIT 1');
    if (result.rows.length === 0) {
      return res.json({
        action: 'Sabia que... ainda não existem curiosidades registadas!',
        taxon_id: null
      });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estatísticas PKI: total de espécies e favoritos do utilizador
app.get('/api/stats/pki', authenticateToken, async (req, res) => {
  try {
    // Total de espécies
    const url = `${INATURE_API}observations/species_counts?verifiable=true&locale=pt&per_page=1&page=1`;
    const response = await fetch(url);
    const data = await response.json();
    const totalSpecies = data.total_results || 0;

    // Total de favoritos do utilizador
    const favRes = await pool.query(
      'SELECT COUNT(*) FROM user_favorites WHERE user_id = $1',
      [req.user.id]
    );
    const favoriteSpecies = parseInt(favRes.rows[0].count, 10);

    res.json({ totalSpecies, favoriteSpecies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Regista interação do utilizador com uma espécie
app.post('/api/user/history', authenticateToken, async (req, res) => {
  const { taxon_id, action } = req.body;
  if (!taxon_id || !action) {
    return res.status(400).json({ error: 'taxon_id e action são obrigatórios.' });
  }
  try {
    // 1. Gravar na base de dados
    await pool.query(
      'INSERT INTO user_species_history (user_id, taxon_id, action) VALUES ($1, $2, $3)',
      [req.user.id, taxon_id, action]
    );

    // 2. Notificar o serviço IA sobre a interação
    try {
      await fetch(`${IA_SERVICE_URL}/record_interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: req.user.id.toString(),
          taxon_id: taxon_id.toString(),
          interaction_type: action,
          timestamp: new Date().toISOString()
        })
      });
    } catch (iaError) {
      console.log('Aviso: Não foi possível notificar o serviço IA:', iaError.message);
    }

    res.json({ success: true, message: 'Interação registada com sucesso' });
  } catch (error) {
    console.error('Erro ao registar interação:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Listar espécies (com paginação, filtro, pesquisa, ordenação)
app.get('/api/species', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const per_page = parseInt(req.query.per_page) || 20;
    // Suporta group_id (string) ou group_ids (array ou string separada por vírgulas)
    let groupIds = [];
    if (req.query.group_ids) {
      if (Array.isArray(req.query.group_ids)) {
        groupIds = req.query.group_ids;
      } else {
        groupIds = req.query.group_ids.split(',');
      }
    } else if (req.query.group_id) {
      groupIds = Array.isArray(req.query.group_id) ? req.query.group_id : [req.query.group_id];
    }
    const { search } = req.query;

    let url = `${INATURE_API}observations/species_counts?per_page=${per_page}&page=${page}&locale=pt&verifiable=true`;
    groupIds.forEach(gid => url += `&iconic_taxa[]=${gid}`);
    if (search) url += `&q=${encodeURIComponent(search)}`;

    const response = await fetch(url);
    const data = await response.json();

    // Filtrar espécies válidas
    const validSpecies = (Array.isArray(data.results) ? data.results : [])
      .filter(item => item.taxon && item.taxon.rank === 'species');

    // Buscar famílias em batch
    const taxonIds = validSpecies.map(item => item.taxon.id);
    const families = await fetchFamiliesInBatch(taxonIds);

    // Mapear resultados com famílias
    const results = validSpecies.map(item => mapSpeciesWithFamilyAndImage(item, families));

    res.json({ results });
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Espécies em destaque (top 5 mais populares do INature)
app.get('/api/species/highlight', async (req, res) => {
  try {
    // Busca as 5 espécies mais populares (por número de observações)
    let url = `${INATURE_API}observations/species_counts?per_page=5&page=1&locale=pt&verifiable=true&order_by=observations_count&order=desc`;
    const response = await fetch(url);
    const data = await response.json();

    // Filtrar apenas os campos necessários
    let results = (Array.isArray(data.results) ? data.results : [])
      .filter(item => item.taxon && item.taxon.rank === 'species')
      .map(item => {
        const t = item.taxon;
        let pt_name = null;
        if (Array.isArray(t.taxon_names)) {
          const pt = t.taxon_names.find(
            n =>
              n.locale === 'pt' ||
              n.locale === 'pt-PT' ||
              n.locale === 'pt-BR' ||
              (n.lexicon && n.lexicon.toLowerCase().includes('portuguese'))
          );
          if (pt) pt_name = pt.name;
        }
        return {
          taxon_id: t.id,
          sci_name: t.name,
          common_name: pt_name || t.preferred_common_name || t.name,
          image_url: t.default_photo?.medium_url || t.default_photo?.square_url || null,
          image_square_url: t.default_photo?.square_url || null,
          image_medium_url: t.default_photo?.medium_url || null,
          group: t.iconic_taxon_name || null,
        };
      });

    res.json({ results });
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Detalhes de uma espécie
app.get('/api/species/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `${INATURE_API}taxa/${id}?all_names=true&locale=pt`;
    const response = await fetch(url);
    const data = await response.json();
    const item = data.results && data.results[0];
    const stripHtml = require('./utils/stripHtml');

    //console .log('Dados da espécie:', item.conservation_statuses);
    if (!item) {
      return res.status(404).json({ error: 'Espécie não encontrada.' });
    }

    // Extrair nomes comuns em várias línguas (até 5, sem duplicados)
    let allNames = [];
    const preferredLocales = [
      { locale: 'pt', label: 'Português' },
      { locale: 'pt-PT', label: 'Português (PT)' },
      { locale: 'pt-BR', label: 'Português (BR)' },
      { locale: 'es', label: 'Espanhol' },
      { locale: 'en', label: 'Inglês' },
      { locale: 'fr', label: 'Francês' },
      { locale: 'it', label: 'Italiano' },
      { locale: 'de', label: 'Alemão' }
    ];

    if (Array.isArray(item.names)) {
      // Só nomes válidos e não científicos
      const validNames = item.names.filter(
        n => n.is_valid && n.lexicon !== 'scientific-names'
      );
      // Adiciona peka prioridade do idioma
      preferredLocales.forEach(({ locale, label }) => {
        const found = validNames.find(n => n.locale === locale);
        if (found && !allNames.some(x => x.name === found.name)) {
          allNames.push({ name: found.name, locale: label });
        }
      });
      // Preenche até 10 nomes, sem duplicados
      validNames.forEach(n => {
        if (
          !allNames.some(x => x.name === n.name) &&
          allNames.length < 10
        ) {
          allNames.push({ name: n.name, locale: n.locale || n.lexicon });
        }
      });
    }

    // Se não houver nomes, usa só o principal se existir
    if (!allNames.length && item.preferred_common_name) {
      allNames.push({ name: item.preferred_common_name, locale: 'Principal' });
    }

    // Nome comum principal em português
    let pt_name = null;
    if (Array.isArray(item.names)) {
      const pt = item.names.find(
        n =>
          n.locale === 'pt' ||
          n.locale === 'pt-PT' ||
          n.locale === 'pt-BR' ||
          (n.lexicon && n.lexicon.toLowerCase().includes('portuguese'))
      );
      if (pt) pt_name = pt.name;
    }

    let conservation_status = null;
    if (item.conservation_status && item.conservation_status.status_name) {
      conservation_status = item.conservation_status.status_name;
    } else if (Array.isArray(item.conservation_statuses) && item.conservation_statuses.length > 0) {
      // Preferir os do IUCN se existir
      const iucnStatus = item.conservation_statuses.find(s => s.authority && s.authority.toLowerCase().includes('iucn'));
      if (iucnStatus && iucnStatus.status) {
        conservation_status = `${iucnStatus.status} (${iucnStatus.authority}${iucnStatus.place ? ', ' + iucnStatus.place.name : ''})`;
      } else {
        // Senão, mostra o primeiro
        const s = item.conservation_statuses[0];
        conservation_status = `${s.status}${s.authority ? ' (' + s.authority : ''}${s.place ? ', ' + s.place.name : ''}${s.authority ? ')' : ''}`;
      }
    }

    let observations_count = null;
    try {
      const obsRes = await fetch(`${INATURE_API}observations/species_counts?taxon_id=${item.id}`);
      const obsData = await obsRes.json();
      if (obsData.results && obsData.results.length > 0) {
        observations_count = obsData.results[0].count;
      }
    } catch (e) {
      observations_count = null;
    }

    // Extrair os nomes taxonómicos dos ancestors
    let taxon_kingdom_name = null, taxon_phylum_name = null, taxon_class_name = null,
      taxon_order_name = null, taxon_family_name = null, taxon_genus_name = null;

    if (Array.isArray(item.ancestors)) {
      for (const ancestor of item.ancestors) {
        if (ancestor.rank === 'kingdom') taxon_kingdom_name = ancestor.name;
        if (ancestor.rank === 'phylum') taxon_phylum_name = ancestor.name;
        if (ancestor.rank === 'class') taxon_class_name = ancestor.name;
        if (ancestor.rank === 'order') taxon_order_name = ancestor.name;
        if (ancestor.rank === 'family') taxon_family_name = ancestor.name;
        if (ancestor.rank === 'genus') taxon_genus_name = ancestor.name;
      }
    }
    if (!taxon_family_name && item.family) taxon_family_name = item.family;
    if (!taxon_genus_name && item.genus) taxon_genus_name = item.genus;

    let description = stripHtml(item.wikipedia_summary) || null;
    // Se a descrição for uma string vazia após stripHtml, definir como null
    if (description && description.trim() === '') {
      description = null;
    }
    let description_generated = false;

    res.json({
      taxon_id: item.id,
      sci_name: item.name,
      common_name: pt_name || item.preferred_common_name || item.name,
      all_names: allNames,
      group: item.iconic_taxon_name || null,
      family: taxon_family_name,
      taxon_kingdom_name,
      taxon_phylum_name,
      taxon_class_name,
      taxon_order_name,
      taxon_family_name,
      taxon_genus_name,
      conservation_status,
      observations_count,
      image_url: item.default_photo?.medium_url || item.default_photo?.square_url || null,
      image_square_url: item.default_photo?.square_url || null,
      image_medium_url: item.default_photo?.medium_url || null,
      wikipedia_url: item.wikipedia_url || null,
      description,
      description_generated,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================
// 5. FAVORITOS
// ==========================

// Adicionar favorito
app.post('/api/favorites', authenticateToken, async (req, res) => {
  const { taxon_id } = req.body;

  if (!taxon_id) return res.status(400).json({ error: 'taxon_id é obrigatório.' });
  try {
    await pool.query(
      'INSERT INTO user_favorites (user_id, taxon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, taxon_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remover dos Favotitos
app.delete('/api/favorites/:taxon_id', authenticateToken, async (req, res) => {
  const { taxon_id } = req.params;
  try {
    await pool.query(
      'DELETE FROM user_favorites WHERE user_id = $1 AND taxon_id = $2',
      [req.user.id, taxon_id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar favoritos do utilizador
app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT taxon_id, created_at FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ favorites: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verificar se uma espécie encontra-se nos favoritos
app.get('/api/favorites/:taxon_id', authenticateToken, async (req, res) => {
  const { taxon_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT 1 FROM user_favorites WHERE user_id = $1 AND taxon_id = $2',
      [req.user.id, taxon_id]
    );
    res.json({ favorite: result.rows.length > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================
// 5. RECOMENDAÇÂO
// ==========================
// Recomendações de espécies baseadas no histórico do utilizador
// Usa o serviço Python de IA para gerar recomendações
app.get('/api/recommendations', authenticateToken, async (req, res) => {
  try {
    // 1. Buscar histórico do utilizador (separando favoritos do resto)
    const favs = await pool.query('SELECT taxon_id, created_at FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    const hist = await pool.query('SELECT taxon_id, action, created_at FROM user_species_history WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);

    // Buscar feedback/avaliações sobre recomendações
    const feedback = await pool.query(`
      SELECT taxon_id, action, created_at 
      FROM user_species_history 
      WHERE user_id = $1 AND action LIKE 'feedback_%'
      ORDER BY created_at DESC
    `, [req.user.id]);

    const favoriteIds = favs.rows.map(r => String(r.taxon_id));
    const historyIds = hist.rows.map(r => String(r.taxon_id));
    const feedbackIds = feedback.rows.map(r => String(r.taxon_id));
    const seenTaxonIds = [...new Set([...favoriteIds, ...historyIds])];

    // Categorizar feedback para dar peso
    const positiveFeedback = feedback.rows.filter(f => f.action === 'feedback_liked').map(f => String(f.taxon_id));
    const negativeFeedback = feedback.rows.filter(f => f.action === 'feedback_disliked' || f.action === 'feedback_not_relevant').map(f => String(f.taxon_id));

    console.log('[RECOMENDAÇÕES] Histórico do utilizador:', {
      favoritos: favs.rows.length,
      historico: hist.rows.length,
      feedback_total: feedback.rows.length,
      feedback_positivo: positiveFeedback.length,
      feedback_negativo: negativeFeedback.length,
      especies_vistas: seenTaxonIds.length,
      favoritos_unicos: favoriteIds.length
    });

    // 2. Buscar espécies populares da API externa
    let url = `${INATURE_API}observations/species_counts?per_page=100&page=1&locale=pt&verifiable=true&order_by=observations_count&order=desc`;
    const response = await fetch(url);
    const data = await response.json();

    let candidates = await Promise.all(
      (Array.isArray(data.results) ? data.results : [])
        .filter(item => item.taxon && item.taxon.rank === 'species')
        .filter(item => !seenTaxonIds.includes(String(item.taxon.id))) // Filtrar espécies já vistas
        .slice(0, 50) // Limitar para melhor performance
        .map(item => {
          const t = item.taxon;
          let pt_name = null;
          if (Array.isArray(t.taxon_names)) {
            const pt = t.taxon_names.find(
              n =>
                n.locale === 'pt' ||
                n.locale === 'pt-PT' ||
                n.locale === 'pt-BR' ||
                (n.lexicon && n.lexicon.toLowerCase().includes('portuguese'))
            );
            if (pt) pt_name = pt.name;
          }

          return {
            taxon_id: t.id,
            sci_name: t.name,
            family: null, // Será preenchido em batch depois
            common_name: pt_name || t.preferred_common_name || t.name,
            image_url: t.default_photo?.medium_url || t.default_photo?.square_url || null,
            image_square_url: t.default_photo?.square_url || null,
            image_medium_url: t.default_photo?.medium_url || null,
            group: t.iconic_taxon_name || null,
          };
        })
    );

    // 2.5. Buscar famílias em batch para melhor performance
    console.log('[RECOMENDAÇÕES] Buscando famílias dos candidatos em batch...');
    try {
      const taxonIds = candidates.map(c => c.taxon_id);
      const families = await fetchFamiliesInBatch(taxonIds);

      // Aplicar famílias nos candidatos
      candidates = candidates.map(candidate => ({
        ...candidate,
        family: families[candidate.taxon_id] || null
      }));

      console.log('[RECOMENDAÇÕES] Famílias aplicadas:', {
        candidatos_com_familia: candidates.filter(c => c.family).length,
        total_candidatos: candidates.length
      });
    } catch (familyError) {
      console.warn('[RECOMENDAÇÕES] Erro ao buscar famílias, continuando sem elas:', familyError.message);
    }

    console.log('[RECOMENDAÇÕES] Candidatos processados:', {
      total_brutos: data.results?.length || 0,
      apos_filtros: candidates.length,
      com_familia: candidates.filter(c => c.family).length,
      grupos_unicos: [...new Set(candidates.map(c => c.group))].length
    });

    // 3. Determinar os grupos e as famílias dos favoritos do utilizador com pesos
    let userGroups = [];
    let userFamilies = [];
    let favoriteGroups = [];
    let favoriteFamilies = [];

    if (seenTaxonIds.length > 0) {
      console.log('[RECOMENDAÇÕES] Analisando histórico do utilizador...');
      const taxaRes = await fetch(`${INATURE_API}taxa?${seenTaxonIds.map(id => `id=${id}`).join('&')}&locale=pt`);
      const taxaData = await taxaRes.json();
      console.log('[RECOMENDAÇÕES] Dados taxonômicos recebidos:', taxaData.results?.length || 0, 'espécies');

      const groupCounts = {};
      const familyCounts = {};
      const favoriteGroupCounts = {};
      const favoriteFamilyCounts = {};

      (taxaData.results || []).forEach(t => {
        const taxonId = String(t.id);
        const isFavorite = favoriteIds.includes(taxonId);
        const hasPositiveFeedback = positiveFeedback.includes(taxonId);
        const hasNegativeFeedback = negativeFeedback.includes(taxonId);

        console.log('[RECOMENDAÇÕES] Analisando espécie do histórico:', { name: t.name });

        const group = t.iconic_taxon_name;
        let family = t.family;
        if (!family && Array.isArray(t.ancestors)) {
          const famAncestor = t.ancestors.find(a => a.rank === 'family');
          if (famAncestor) family = famAncestor.name;
        }

        if (group) {
          // Peso base: 1 ponto por histórico normal
          let weight = 1;

          // Peso especial para favoritos: +3 pontos
          if (isFavorite) {
            weight += 3;
            favoriteGroupCounts[group] = (favoriteGroupCounts[group] || 0) + 1;
          }

          // Peso para feedback positivo: +2 pontos
          if (hasPositiveFeedback) {
            weight += 2;
          }

          // Penalização para feedback negativo: -1 ponto (mínimo 0)
          if (hasNegativeFeedback) {
            weight = Math.max(0, weight - 1);
          }

          groupCounts[group] = (groupCounts[group] || 0) + weight;
        }

        if (family) {
          // Aplicar a mesma lógica de pesos para famílias
          let weight = 1;

          if (isFavorite) {
            weight += 3;
            favoriteFamilyCounts[family] = (favoriteFamilyCounts[family] || 0) + 1;
          }

          if (hasPositiveFeedback) {
            weight += 2;
          }

          if (hasNegativeFeedback) {
            weight = Math.max(0, weight - 1);
          }

          familyCounts[family] = (familyCounts[family] || 0) + weight;
        }
      });

      console.log('[RECOMENDAÇÕES] Contagem de grupos (com pesos):', groupCounts);
      console.log('[RECOMENDAÇÕES] Contagem de famílias (com pesos):', familyCounts);
      console.log('[RECOMENDAÇÕES] Grupos dos favoritos:', favoriteGroupCounts);
      console.log('[RECOMENDAÇÕES] Famílias dos favoritos:', favoriteFamilyCounts);

      userGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([group]) => group);

      favoriteGroups = Object.entries(favoriteGroupCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([group]) => group);

      userFamilies = Object.entries(familyCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([family]) => family);

      favoriteFamilies = Object.entries(favoriteFamilyCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([family]) => family);

      console.log('[RECOMENDAÇÕES] Grupos preferidos do utilizador:', userGroups);
      console.log('[RECOMENDAÇÕES] Famílias preferidas do utilizador:', userFamilies);
    }

    // 4. Se não houver histórico, devolve os populares
    if (userGroups.length === 0 && userFamilies.length === 0) {
      console.log('[RECOMENDAÇÕES] Sem histórico, devolvendo candidatos populares');
      return res.json({ results: candidates.slice(0, 10) });
    }

    // 5. Chamar o serviço Python de IA para recomendar
    console.log('[RECOMENDAÇÕES] Enviando para serviço de IA...');
    console.log('[RECOMENDAÇÕES] === ARGUMENTOS DETALHADOS ===');
    console.log('[RECOMENDAÇÕES] Grupos do utilizador:', userGroups);
    console.log('[RECOMENDAÇÕES] Famílias do utilizador:', userFamilies);
    console.log('[RECOMENDAÇÕES] Espécies já vistas:', seenTaxonIds.length, 'espécies');
    console.log('[RECOMENDAÇÕES] Candidatos por grupo:',
      candidates.reduce((acc, c) => {
        const group = c.group || 'Sem grupo';
        acc[group] = (acc[group] || 0) + 1;
        return acc;
      }, {})
    );
    console.log('[RECOMENDAÇÕES] Primeiros 3 candidatos:', candidates.slice(0, 3).map(c => ({ common_name: c.common_name })));

    const requestPayload = {
      user_groups: userGroups,
      user_families: userFamilies,
      favorite_groups: favoriteGroups,
      favorite_families: favoriteFamilies,
      seen_taxon_ids: seenTaxonIds,
      favorite_taxon_ids: favoriteIds,
      positive_feedback_ids: positiveFeedback,
      negative_feedback_ids: negativeFeedback,
      candidates,
      preferences_weight: {
        favorites: 3.0,
        positive_feedback: 2.0,
        negative_feedback: -1.0,
        history: 1.0
      }
    };

    const iaRes = await fetch(`${IA_SERVICE_URL}/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    if (!iaRes.ok) {
      console.error('[RECOMENDAÇÕES] Erro no serviço de IA:', iaRes.status);
      // Fallback: priorizar grupos/famílias dos favoritos, depois grupos gerais
      let fallbackCandidates = [];

      // 1. Primeiro, candidatos dos grupos dos favoritos
      if (favoriteGroups.length > 0) {
        fallbackCandidates.push(...candidates.filter(c => favoriteGroups.includes(c.group)));
      }

      // 2. Depois, candidatos das famílias dos favoritos
      if (favoriteFamilies.length > 0) {
        const familyMatches = candidates.filter(c =>
          favoriteFamilies.includes(c.family) &&
          !fallbackCandidates.some(fc => fc.taxon_id === c.taxon_id)
        );
        fallbackCandidates.push(...familyMatches);
      }

      // 3. Por último, grupos gerais do histórico
      if (fallbackCandidates.length < 10) {
        const generalMatches = candidates.filter(c =>
          userGroups.includes(c.group) &&
          !fallbackCandidates.some(fc => fc.taxon_id === c.taxon_id)
        );
        fallbackCandidates.push(...generalMatches);
      }

      console.log('[RECOMENDAÇÕES] Fallback encontrou:', {
        from_favorite_groups: fallbackCandidates.filter(c => favoriteGroups.includes(c.group)).length,
        from_favorite_families: fallbackCandidates.filter(c => favoriteFamilies.includes(c.family)).length,
        total: fallbackCandidates.length
      });

      return res.json({
        results: fallbackCandidates.slice(0, 10),
        fallback: true,
        reason: 'Serviço de IA indisponível - usando preferências dos favoritos'
      });
    }

    const iaData = await iaRes.json();
    console.log('[RECOMENDAÇÕES] Recebidas do serviço de IA:', iaData.results?.length || 0);
    console.log('[RECOMENDAÇÕES] Recomendações recebidas por grupo:',
      (iaData.results || []).reduce((acc, r) => {
        const group = r.group || 'Sem grupo';
        acc[group] = (acc[group] || 0) + 1;
        return acc;
      }, {})
    );
    console.log('[RECOMENDAÇÕES] Primeiras 3 recomendações:',
      (iaData.results || []).slice(0, 3).map(r => ({
        taxon_id: r.taxon_id,
        common_name: r.common_name,
        group: r.group,
        family: r.family,
        recommendation_score: r.recommendation_score
      }))
    );
    console.log('[RECOMENDAÇÕES] === FIM LOGS DETALHADOS ===');

    // 6. Devolver as recomendações vindas do Python
    res.json({ results: iaData.results || [] });
  } catch (error) {
    console.error('Erro em /api/recommendations:', error.message);

    // Fallback: retornar recomendações básicas baseadas em grupos populares
    try {
      console.log('[RECOMENDAÇÕES] Usando fallback devido a erro...');

      // Buscar algumas espécies populares por grupo como fallback
      const fallbackUrl = `${INATURE_API}observations/species_counts?per_page=10&page=1&locale=pt&verifiable=true&order_by=observations_count&order=desc`;
      const fallbackResponse = await fetch(fallbackUrl);

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        const fallbackResults = (fallbackData.results || [])
          .filter(item => item.taxon && item.taxon.rank === 'species')
          .slice(0, 5)
          .map(item => {
            const t = item.taxon;
            return {
              taxon_id: t.id,
              sci_name: t.name,
              common_name: t.preferred_common_name || t.name,
              image_url: t.default_photo?.medium_url || t.default_photo?.square_url || null,
              image_square_url: t.default_photo?.square_url || null,
              image_medium_url: t.default_photo?.medium_url || null,
              group: t.iconic_taxon_name || null,
              family: null,
              recommendation_score: 0.5,
              recommendation_reason: 'Recomendação baseada em popularidade (fallback)'
            };
          });

        console.log('[RECOMENDAÇÕES] Fallback retornou:', fallbackResults.length, 'espécies');
        res.json({ results: fallbackResults });
        return;
      }
    } catch (fallbackError) {
      console.error('[RECOMENDAÇÕES] Erro no fallback:', fallbackError.message);
    }

    // Se tudo falhar, retornar array vazio
    res.status(500).json({
      error: 'Serviço de recomendações temporariamente indisponível',
      results: []
    });
  }
});

// Recomendações avançadas usando o IA_SERVICE
app.post('/api/recommendations/advanced', authenticateToken, async (req, res) => {
  try {
    const { algorithm = 'hybrid', limit = 10 } = req.body;

    // 1. Buscar histórico do utilizador (com pesos para favoritos e feedback)
    const favs = await pool.query('SELECT taxon_id, created_at FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    const hist = await pool.query('SELECT taxon_id, action, created_at FROM user_species_history WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);

    // Buscar feedback/avaliações
    const feedback = await pool.query(`
      SELECT taxon_id, action, created_at 
      FROM user_species_history 
      WHERE user_id = $1 AND action LIKE 'feedback_%'
      ORDER BY created_at DESC
    `, [req.user.id]);

    const favoriteIds = favs.rows.map(r => String(r.taxon_id));
    const historyIds = hist.rows.map(r => String(r.taxon_id));
    const seenTaxonIds = [...new Set([...favoriteIds, ...historyIds])];

    const positiveFeedback = feedback.rows.filter(f => f.action === 'feedback_liked').map(f => String(f.taxon_id));
    const negativeFeedback = feedback.rows.filter(f => f.action === 'feedback_disliked' || f.action === 'feedback_not_relevant').map(f => String(f.taxon_id));

    // 2. Buscar espécies populares da API externa
    let url = `${INATURE_API}observations/species_counts?per_page=100&page=1&locale=pt&verifiable=true&order_by=observations_count&order=desc`;
    const response = await fetch(url);
    const data = await response.json();

    let candidates = await Promise.all(
      (Array.isArray(data.results) ? data.results : [])
        .filter(item => item.taxon && item.taxon.rank === 'species')
        .filter(item => !seenTaxonIds.includes(String(item.taxon.id))) // Filtrar espécies já vistas
        .slice(0, 50) // Limitar para melhorar performance
        .map(async item => {
          const t = item.taxon;
          let pt_name = null;
          if (Array.isArray(t.taxon_names)) {
            const pt = t.taxon_names.find(
              n =>
                n.locale === 'pt' ||
                n.locale === 'pt-PT' ||
                n.locale === 'pt-BR' ||
                (n.lexicon && n.lexicon.toLowerCase().includes('portuguese'))
            );
            if (pt) pt_name = pt.name;
          }

          // Tentar obter família dos ancestors
          let taxon_family_name = null;
          try {
            const familyResponse = await fetch(`${INATURE_API}taxa/${t.id}?all_names=true&locale=pt`);
            const familyData = await familyResponse.json();
            const itemData = familyData.results && familyData.results[0];
            if (itemData && Array.isArray(itemData.ancestors)) {
              const famAncestor = itemData.ancestors.find(a => a.rank === 'family');
              if (famAncestor) taxon_family_name = famAncestor.name;
            }
          } catch (e) {
            taxon_family_name = null;
          }

          return {
            taxon_id: t.id,
            sci_name: t.name,
            family: taxon_family_name || null,
            common_name: pt_name || t.preferred_common_name || t.name,
            image_url: t.default_photo?.medium_url || t.default_photo?.square_url || null,
            image_square_url: t.default_photo?.square_url || null,
            image_medium_url: t.default_photo?.medium_url || null,
            group: t.iconic_taxon_name || null,
          };
        })
    );

    // 3. Determinar os grupos e as famílias dos favoritos do utilizador com pesos
    let userGroups = [];
    let userFamilies = [];
    let favoriteGroups = [];
    let favoriteFamilies = [];

    if (seenTaxonIds.length > 0) {
      const taxaRes = await fetch(`${INATURE_API}taxa?${seenTaxonIds.map(id => `id=${id}`).join('&')}&locale=pt`);
      const taxaData = await taxaRes.json();
      const groupCounts = {};
      const familyCounts = {};
      const favoriteGroupCounts = {};
      const favoriteFamilyCounts = {};

      (taxaData.results || []).forEach(t => {
        const taxonId = String(t.id);
        const isFavorite = favoriteIds.includes(taxonId);
        const hasPositiveFeedback = positiveFeedback.includes(taxonId);
        const hasNegativeFeedback = negativeFeedback.includes(taxonId);

        const group = t.iconic_taxon_name;
        let family = t.family;
        if (!family && Array.isArray(t.ancestors)) {
          const famAncestor = t.ancestors.find(a => a.rank === 'family');
          if (famAncestor) family = famAncestor.name;
        }

        if (group) {
          let weight = 1;
          if (isFavorite) {
            weight += 3;
            favoriteGroupCounts[group] = (favoriteGroupCounts[group] || 0) + 1;
          }
          if (hasPositiveFeedback) weight += 2;
          if (hasNegativeFeedback) weight = Math.max(0, weight - 1);
          groupCounts[group] = (groupCounts[group] || 0) + weight;
        }

        if (family) {
          let weight = 1;
          if (isFavorite) {
            weight += 3;
            favoriteFamilyCounts[family] = (favoriteFamilyCounts[family] || 0) + 1;
          }
          if (hasPositiveFeedback) weight += 2;
          if (hasNegativeFeedback) weight = Math.max(0, weight - 1);
          familyCounts[family] = (familyCounts[family] || 0) + weight;
        }
      });

      userGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([group]) => group);
      userFamilies = Object.entries(familyCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([family]) => family);
      favoriteGroups = Object.entries(favoriteGroupCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([group]) => group);
      favoriteFamilies = Object.entries(favoriteFamilyCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([family]) => family);
    }

    // 4. Chamar o serviço IA avançado
    const iaRes = await fetch(`${IA_SERVICE_URL}/advanced_recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: req.user.id.toString(),
        user_groups: userGroups,
        user_families: userFamilies,
        favorite_groups: favoriteGroups,
        favorite_families: favoriteFamilies,
        favorite_taxon_ids: favoriteIds,
        positive_feedback_ids: positiveFeedback,
        negative_feedback_ids: negativeFeedback,
        seen_taxon_ids: seenTaxonIds,
        candidates: candidates,
        algorithm: algorithm,
        limit: limit,
        preferences_weight: {
          favorites: 3.0,
          positive_feedback: 2.0,
          negative_feedback: -1.0,
          history: 1.0
        }
      })
    });

    const iaData = await iaRes.json();

    // 5. Registar que o utilizador recebeu recomendações
    try {
      await pool.query(
        'INSERT INTO user_species_history (user_id, taxon_id, action) VALUES ($1, $2, $3)',
        [req.user.id, 0, 'recommendation_received']
      );
    } catch (e) {
      console.log('Aviso: Não foi possível registar recepção de recomendações:', e.message);
    }

    res.json({
      results: iaData.results || [],
      algorithm: iaData.algorithm || algorithm,
      explanation: iaData.explanation || 'Recomendações geradas',
      total_candidates: candidates.length,
      user_preferences: {
        groups: userGroups.slice(0, 3),
        families: userFamilies.slice(0, 3),
        seen_species: seenTaxonIds.length
      }
    });
  } catch (error) {
    console.error('Erro em /api/recommendations/advanced:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para registar feedback com rating sobre recomendações
app.post('/api/recommendations/rating-feedback', authenticateToken, async (req, res) => {
  try {
    const { recommendation_id, species_id, rating, feedback_text = '', algorithm_used = 'hybrid' } = req.body;

    if (!species_id || !rating) {
      return res.status(400).json({ error: 'species_id e rating são obrigatórios.' });
    }

    // Validar rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating deve ser entre 1 e 5.' });
    }

    // Converter rating para feedback_type baseado na escala
    let feedback_type;
    if (rating <= 2) {
      feedback_type = 'disliked';
    } else if (rating >= 4) {
      feedback_type = 'liked';
    } else {
      feedback_type = 'not_relevant'; // Rating neutro
    }

    console.log(`[RATING-FEEDBACK] Usuário ${req.user.id} avaliou espécie ${species_id} com ${rating} estrelas`);

    // Enviar feedback para o serviço IA
    const iaRes = await fetch(`${IA_SERVICE_URL}/recommendations/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: req.user.id.toString(),
        recommended_taxon_id: species_id.toString(),
        feedback_type: feedback_type,
        algorithm_used: algorithm_used,
        rating: rating,
        feedback_text: feedback_text || ''
      })
    });

    let iaData = { message: 'Feedback registado localmente' };
    if (iaRes.ok) {
      iaData = await iaRes.json();
    } else {
      console.warn('[RATING-FEEDBACK] Erro ao enviar para IA, mas continuando com registro local');
    }

    // Registar no histórico local
    await pool.query(
      'INSERT INTO user_species_history (user_id, taxon_id, action) VALUES ($1, $2, $3)',
      [req.user.id, species_id, `rating_${rating}`]
    );

    // Se houver tabela de recommendation_feedback, inserir também lá
    try {
      await pool.query(
        'INSERT INTO recommendation_feedback (user_id, recommended_taxon_id, feedback_type, algorithm_used) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [req.user.id, species_id, feedback_type, algorithm_used]
      );
    } catch (dbError) {
      console.warn('[RATING-FEEDBACK] Erro ao inserir em recommendation_feedback (tabela pode não existir):', dbError.message);
    }

    res.json({
      success: true,
      message: iaData.message || 'Avaliação registada com sucesso!',
      rating: rating,
      feedback_type: feedback_type
    });
  } catch (error) {
    console.error('[RATING-FEEDBACK] Erro ao registar feedback com rating:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Endpoint para registar feedback sobre recomendações
app.post('/api/recommendations/feedback', authenticateToken, async (req, res) => {
  try {
    const { taxon_id, feedback_type, algorithm_used = 'hybrid' } = req.body;

    if (!taxon_id || !feedback_type) {
      return res.status(400).json({ error: 'taxon_id e feedback_type são obrigatórios.' });
    }

    // Validar feedback_type
    const validFeedbackTypes = ['liked', 'disliked', 'not_relevant', 'already_known'];
    if (!validFeedbackTypes.includes(feedback_type)) {
      return res.status(400).json({ error: 'feedback_type inválido.' });
    }

    // Enviar feedback para o serviço IA
    const iaRes = await fetch(`${IA_SERVICE_URL}/recommendations/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: req.user.id.toString(),
        recommended_taxon_id: taxon_id.toString(),
        feedback_type: feedback_type,
        algorithm_used: algorithm_used
      })
    });

    if (!iaRes.ok) {
      throw new Error('Erro ao enviar feedback para o serviço IA');
    }

    const iaData = await iaRes.json();

    // Registar também no histórico local
    await pool.query(
      'INSERT INTO user_species_history (user_id, taxon_id, action) VALUES ($1, $2, $3)',
      [req.user.id, taxon_id, `feedback_${feedback_type}`]
    );

    res.json({
      success: true,
      message: iaData.message || 'Feedback registado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao registar feedback:', error.message);
    res.status(500).json({ error: error.message });
  }
});



// Endpoint para estatísticas do sistema de recomendações
app.get('/api/recommendations/stats', authenticateToken, async (req, res) => {
  try {
    const iaRes = await fetch(`${IA_SERVICE_URL}/recommendations/stats`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!iaRes.ok) {
      throw new Error('Erro ao obter estatísticas do serviço IA');
    }

    const iaData = await iaRes.json();
    res.json(iaData);
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para insights específicos do utilizador
app.get('/api/user/insights', authenticateToken, async (req, res) => {
  try {
    console.log('[INSIGHTS] === INICIANDO CÁLCULO DE INSIGHTS ===');
    console.log('[INSIGHTS] Utilizador ID:', req.user.id);

    // 1. Buscar dados básicos do utilizador
    const favs = await pool.query('SELECT taxon_id FROM user_favorites WHERE user_id = $1', [req.user.id]);
    const hist = await pool.query('SELECT taxon_id, action, created_at FROM user_species_history WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);

    console.log('[INSIGHTS] Favoritos encontrados:', favs.rows.length);
    console.log('[INSIGHTS] Histórico encontrado:', hist.rows.length);

    const favoriteIds = favs.rows.map(r => String(r.taxon_id));
    const totalInteractions = hist.rows.length;

    // 2. Obter dados taxonómicos dos favoritos para calcular grupos
    let favoriteGroups = [];
    if (favoriteIds.length > 0) {
      try {
        const taxaRes = await fetch(`${INATURE_API}taxa?${favoriteIds.map(id => `id=${id}`).join('&')}&locale=pt`);
        const taxaData = await taxaRes.json();

        const groupCounts = {};
        (taxaData.results || []).forEach(t => {
          const group = t.iconic_taxon_name;
          if (group) {
            groupCounts[group] = (groupCounts[group] || 0) + 1;
          }
        });

        favoriteGroups = Object.entries(groupCounts).map(([group_id, count]) => ({
          group_id,
          count
        }));

        console.log('[INSIGHTS] Grupos favoritos calculados:', favoriteGroups);
      } catch (error) {
        console.warn('[INSIGHTS] Erro ao buscar dados taxonómicos:', error.message);
      }
    }

    // 3. Calcular score de preferência baseado no engagement
    const actionCounts = {};
    hist.rows.forEach(row => {
      const action = row.action;
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    });

    // Calcular engagement score com pesos mais equilibrados
    let engagementScore = 0;
    if (totalInteractions > 0) {
      const favoriteWeight = (actionCounts.favorite || 0) * 5;     // Favoritos = peso 5
      const identifyWeight = (actionCounts.identify || 0) * 3;     // Identificações = peso 3
      const viewWeight = (actionCounts.view || 0) * 1;             // Visualizações = peso 1
      const searchWeight = (actionCounts.search || 0) * 1;         // Pesquisas = peso 1
      const clickWeight = (actionCounts.click || 0) * 2;           // Cliques = peso 2

      const totalWeightedScore = favoriteWeight + identifyWeight + viewWeight + searchWeight + clickWeight;
      const maxPossibleScore = totalInteractions * 5; // Se todas fossem favoritos

      engagementScore = totalWeightedScore / maxPossibleScore;
    }

    // Garantir que o score está entre 0 e 1
    const preferenceScore = Math.min(Math.max(engagementScore, 0), 1);

    console.log('[INSIGHTS] Score calculado:', {
      totalInteractions,
      actionCounts,
      engagementScore,
      preferenceScore: Math.round(preferenceScore * 100) + '%',
      favoriteGroupsCount: favoriteGroups.length
    });

    // 4. Montar resposta
    const insights = {
      total_interactions: totalInteractions,
      favorite_groups: favoriteGroups,
      preference_score: preferenceScore,
      recent_activity: hist.rows.slice(0, 10).map(row => ({
        species_id: row.taxon_id,
        interaction_type: row.action,
        created_at: row.created_at || new Date().toISOString()
      }))
    };

    console.log('[INSIGHTS] === RESPOSTA FINAL ===');
    console.log('[INSIGHTS] Total interações:', insights.total_interactions);
    console.log('[INSIGHTS] Score preferência:', Math.round(insights.preference_score * 100) + '%');
    console.log('[INSIGHTS] Grupos favoritos:', insights.favorite_groups.length);
    console.log('[INSIGHTS] ========================');

    res.json(insights);
  } catch (error) {
    console.error('[INSIGHTS] Erro ao obter insights do utilizador:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================
// 7. RECONHECIMENTO/IA (FOTO E VÍDEO)
// ==========================

// Identificação de espécies por foto(s)
// Espera um ficheiro ou um batch de imagens (multipart/form-data)
app.post('/api/identify-species', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Imagem(ns) não enviada(s).' });
    }

    // Garante que a pasta existe
    if (!fs.existsSync(IDENTIFY_SPECIES_DIR)) {
      fs.mkdirSync(IDENTIFY_SPECIES_DIR, { recursive: true });
    }

    // Nome base pelo JWT id + timestamp
    const jwtValue = req.user && req.user.id ? String(req.user.id) : 'unknown';
    const now = Date.now();

    // Guarda cada ficheiro como {id}_{timestamp}_{idx}.jpg
    req.files.forEach((f, idx) => {
      const filename = `${jwtValue}_${now}_${idx + 1}.jpg`;
      const filePath = path.join(IDENTIFY_SPECIES_DIR, filename);
      fs.writeFileSync(filePath, f.buffer);
    });

    // Converte cada imagem para base64 para enviar ao serviço IA
    const imagesBase64 = req.files.map(f => f.buffer.toString('base64'));

    if (imagesBase64.length === 1) {
      // Single image
      const response = await fetch(IA_SERVICE_URL + '/identify_species', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imagesBase64[0] }),
      });
      const status = response.status;
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return res.status(500).json({ error: 'Resposta inválida do IA_Service.' });
      }
      if (response.ok) {
        return res.json(data);
      } else {
        return res.status(status).json(data);
      }
    } else {
      // Batch de imagens
      const response = await fetch(IA_SERVICE_URL + '/identify_species', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imagesBase64 }),
      });
      const status = response.status;
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return res.status(500).json({ error: 'Resposta inválida do IA_Service.' });
      }
      if (response.ok) {
        return res.json(data);
      } else {
        return res.status(status).json(data);
      }
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro na identificação de espécies.' });
  }
});

// ==========================
// 8. LLM/CHAT/RAG
// ==========================

// Healthcheck do serviço IA
app.get('/llm/health', async (req, res) => {
  try {
    const healthRes = await axios.get(IA_SERVICE_URL + '/health');
    if (healthRes.data && healthRes.data.status === 'ok') {
      res.json({ status: 'ok' });
    } else {
      res.status(503).json({ status: 'down' });
    }
  } catch (e) {
    res.status(503).json({ status: 'down' });
  }
});

// Enviar mensagem ao LLM (SocketIO)
app.post('/api/llm', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt é obrigatório.' });
  }
  const socket = io(process.env.IA_SERVICE_URL || 'http://ia_service:8000', {
    transports: ['websocket'],
    timeout: 600000
  });

  let responded = false;

  socket.on('connect', () => {
    socket.emit('llm_message', { prompt });
  });

  socket.on('llm_response', (data) => {
    if (!responded) {
      responded = true;
      res.json(data);
      socket.disconnect();
    }
  });

  socket.on('connect_error', (err) => {
    if (!responded) {
      responded = true;
      res.status(503).json({ error: 'O serviço IA não está disponível de momento.' });
      socket.disconnect();
    }
  });

  setTimeout(() => {
    if (!responded) {
      responded = true;
      res.status(504).json({ error: 'Foi excedido o tempo máximo ao serviço IA.' });
      socket.disconnect();
    }
  }, 600000);
});

// Enviar mensagem ao LLM externo (OpenRouter)
app.post('/api/llm2', async (req, res) => {
  const { prompt, system } = req.body;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const MODEL_LLM_PUBLIC = process.env.MODEL_LLM_PUBLIC;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt é obrigatório.' });
  }
  if (!openrouterApiKey) {
    return res.status(500).json({ error: 'API Key do OpenRouter não está configurada.' });
  }
  //console.log('Envio para IA Router:', prompt);
  const socket = io(process.env.IA_SERVICE_URL || 'http://ia_service:8000', {
    transports: ['websocket'],
  });

  let responded = false;

  socket.on('connect', () => {
    socket.emit('llm2_message', { prompt, system, api_key: openrouterApiKey, model: MODEL_LLM_PUBLIC });
  });

  socket.on('llm2_response', (data) => {
    if (!responded) {
      responded = true;
      //console.log('Resposta do IA Router', data);
      res.json(data);
      socket.disconnect();
    }
  });

  socket.on('connect_error', (err) => {
    if (!responded) {
      responded = true;
      res.status(503).json({ error: 'O serviço IA não está disponível de momento.' });
      socket.disconnect();
    }
  });

  setTimeout(() => {
    if (!responded) {
      responded = true;
      res.status(504).json({ error: 'Foi excedido o tempo máximo ao serviço IA.' });
      socket.disconnect();
    }
  }, 600000);
});

// ==========================
// 9. ROTAS DE RECOMENDAÇÕES
// ==========================

// Rota para recomendações personalizadas
app.get('/recommendations/personalized', authenticateToken, async (req, res) => {
  try {
    console.log('=== INÍCIO - Recomendações Personalizadas ===');
    const { limit = 10 } = req.query;

    // 1. Buscar histórico do utilizador
    console.log('1. Buscando histórico do utilizador...');
    const favs = await pool.query('SELECT taxon_id FROM user_favorites WHERE user_id = $1', [req.user.id]);
    const hist = await pool.query('SELECT taxon_id FROM user_species_history WHERE user_id = $1', [req.user.id]);
    const seenTaxonIds = [...new Set([...favs.rows, ...hist.rows].map(r => String(r.taxon_id)))];

    // 2. Buscar espécies populares da API externa
    let url = `${INATURE_API}observations/species_counts?per_page=50&page=1&locale=pt&verifiable=true&order_by=observations_count&order=desc`;
    const response = await fetch(url);
    const data = await response.json();
    let candidates = await Promise.all(
      (Array.isArray(data.results) ? data.results : [])
        .filter(item => item.taxon && item.taxon.rank === 'species')
        .filter(item => !seenTaxonIds.includes(String(item.taxon.id))) // Filtrar espécies já vistas
        .map(async item => {
          const t = item.taxon;
          let pt_name = null;
          if (Array.isArray(t.taxon_names)) {
            const pt = t.taxon_names.find(
              n =>
                n.locale === 'pt' ||
                n.locale === 'pt-PT' ||
                n.locale === 'pt-BR' ||
                (n.lexicon && n.lexicon.toLowerCase().includes('portuguese'))
            );
            if (pt) pt_name = pt.name;
          }

          // Tentar obter família dos ancestors
          let taxon_family_name = null
          try {
            const response = await fetch(`${INATURE_API}taxa/${t.id}?all_names=true&locale=pt`);
            const data = await response.json();
            const itemData = data.results && data.results[0];
            if (itemData) {
              if (Array.isArray(itemData.ancestors)) {
                for (const ancestor of itemData.ancestors) {
                  if (ancestor.rank === 'family') taxon_family_name = ancestor.name;
                }
              }
              if (!taxon_family_name && itemData.family) taxon_family_name = itemData.family;
            }
          } catch (e) {
            taxon_family_name = null;
          }

          return {
            taxon_id: t.id,
            sci_name: t.name,
            family: taxon_family_name || null,
            common_name: pt_name || t.preferred_common_name || t.name,
            image_url: t.default_photo?.medium_url || t.default_photo?.square_url || null,
            image_square_url: t.default_photo?.square_url || null,
            image_medium_url: t.default_photo?.medium_url || null,
            group: t.iconic_taxon_name || null,
          };
        })
    );

    // Preencher famílias em falta (batch)
    const missingFamily = candidates.filter(c => !c.family).map(c => c.taxon_id);

    if (missingFamily.length > 0) {
      const taxaRes = await fetch(`${INATURE_API}taxa?${missingFamily.map(id => `id=${id}`).join('&')}&locale=pt`);
      const taxaData = await taxaRes.json();
      const idToFamily = {};
      (taxaData.results || []).forEach(t => {
        let fam = t.family || null;
        if (!fam && Array.isArray(t.ancestors)) {
          const famAncestor = t.ancestors.find(a => a.rank === 'family');
          if (famAncestor) fam = famAncestor.name;
        }
        idToFamily[String(t.id)] = fam;
      });
      candidates = candidates.map(c => ({
        ...c,
        family: c.family || idToFamily[c.taxon_id] || null
      }));
    }

    // 3. Determinar grupos e famílias favoritos do utilizador
    let userGroups = [];
    let userFamilies = [];
    if (seenTaxonIds.length > 0) {
      const taxaRes = await fetch(`${INATURE_API}taxa?${seenTaxonIds.map(id => `id=${id}`).join('&')}&locale=pt`);
      const taxaData = await taxaRes.json();
      const groupCounts = {};
      const familyCounts = {};
      (taxaData.results || []).forEach(t => {
        const group = t.iconic_taxon_name;
        let family = t.family;
        if (!family && Array.isArray(t.ancestors)) {
          const famAncestor = t.ancestors.find(a => a.rank === 'family');
          if (famAncestor) family = famAncestor.name;
        }
        if (group) groupCounts[group] = (groupCounts[group] || 0) + 1;
        if (family) familyCounts[family] = (familyCounts[family] || 0) + 1;
      });
      userGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([group]) => group);
      userFamilies = Object.entries(familyCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([family]) => family);
    }

    // 4. Se não houver histórico, devolve populares
    if (userGroups.length === 0 && userFamilies.length === 0) {
      return res.json({ results: candidates.slice(0, 10) });
    }

    // 5. Chamar o serviço Python de IA para recomendar
    const iaRes = await fetch(`${IA_SERVICE_URL}/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_groups: userGroups,
        user_families: userFamilies,
        seen_taxon_ids: seenTaxonIds,
        candidates
      })
    });
    const iaData = await iaRes.json();

    // 6. Devolver as recomendações vindas do Python
    res.json({ results: iaData.results || [] });
  } catch (error) {
    console.error('Erro em /api/recommendations:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Recomendações baseadas em conteúdo para uma espécie específica
app.get('/api/recommendations/content-based/:speciesId', authenticateToken, async (req, res) => {
  try {
    const { speciesId } = req.params;
    const { limit = 5 } = req.query;

    console.log('[CONTENT-BASED] Iniciando recomendações para espécie:', speciesId);

    // 1. Buscar dados da espécie atual para obter grupo e família
    console.log('[CONTENT-BASED] Buscando dados da espécie atual...');
    const currentSpeciesResponse = await fetch(`${INATURE_API}taxa/${speciesId}?locale=pt`);
    const currentSpeciesData = await currentSpeciesResponse.json();
    const currentSpecies = currentSpeciesData.results?.[0];

    if (!currentSpecies) {
      return res.status(404).json({ error: 'Espécie não encontrada' });
    }

    const currentGroup = currentSpecies.iconic_taxon_name;
    let currentFamily = currentSpecies.family;
    let currentOrder = null;
    let currentClass = null;

    // Extrair família, ordem e classe dos ancestors se não estiver disponível
    if (Array.isArray(currentSpecies.ancestors)) {
      for (const ancestor of currentSpecies.ancestors) {
        if (ancestor.rank === 'family' && !currentFamily) {
          currentFamily = ancestor.name;
        }
        if (ancestor.rank === 'order') {
          currentOrder = ancestor.name;
        }
        if (ancestor.rank === 'class') {
          currentClass = ancestor.name;
        }
      }
    }

    console.log('🧬 [CONTENT-BASED] Dados da espécie atual:', {
      taxon_id: currentSpecies.id,
      name: currentSpecies.name,
      common_name: currentSpecies.preferred_common_name,
      group: currentGroup,
      family: currentFamily,
      order: currentOrder,
      class: currentClass
    });

    // 2. Buscar histórico do usuário para excluir espécies já vistas
    const favs = await pool.query('SELECT taxon_id FROM user_favorites WHERE user_id = $1', [req.user.id]);
    const hist = await pool.query('SELECT taxon_id FROM user_species_history WHERE user_id = $1', [req.user.id]);
    const seenTaxonIds = [...new Set([...favs.rows, ...hist.rows].map(r => String(r.taxon_id)))];

    console.log('[CONTENT-BASED] Espécies já vistas pelo usuário:', seenTaxonIds.length);

    // 3. Estratégia em cascata: Família > Ordem > Classe > Grupo
    const searchStrategies = [];

    // Buscar IDs dos ancestors
    let familyId = null;
    let orderId = null;
    let classId = null;

    if (Array.isArray(currentSpecies.ancestors)) {
      for (const ancestor of currentSpecies.ancestors) {
        if (ancestor.rank === 'family') {
          familyId = ancestor.id;
        }
        if (ancestor.rank === 'order') {
          orderId = ancestor.id;
        }
        if (ancestor.rank === 'class') {
          classId = ancestor.id;
        }
      }
    }

    // Adicionar estratégias apenas se tivermos IDs válidos
    if (familyId && currentFamily) {
      searchStrategies.push({
        level: 'família',
        filter: `parent_id=${familyId}`,
        name: currentFamily,
        minResults: 3
      });
    }

    if (orderId && currentOrder) {
      searchStrategies.push({
        level: 'ordem',
        filter: `parent_id=${orderId}`,
        name: currentOrder,
        minResults: 2
      });
    }

    if (classId && currentClass) {
      searchStrategies.push({
        level: 'classe',
        filter: `parent_id=${classId}`,
        name: currentClass,
        minResults: 1
      });
    }

    if (currentGroup) {
      // Para alguns grupos, usar taxon_id específico em vez de iconic_taxa
      let groupFilter;
      const groupConfig = GROUPS.find(g => g.id === currentGroup);

      if (groupConfig && groupConfig.ancestor_ids && groupConfig.ancestor_ids.length > 0) {
        // Usar taxon_id específico para melhor precisão
        groupFilter = `taxon_id=${groupConfig.ancestor_ids[0]}`;
      } else {
        // Fallback para iconic_taxa
        groupFilter = `iconic_taxa=${encodeURIComponent(currentGroup)}`;
      }

      searchStrategies.push({
        level: 'grupo',
        filter: groupFilter,
        name: currentGroup,
        minResults: 1
      });
    }

    console.log('[CONTENT-BASED] Estratégias de busca:', searchStrategies.map(s => ({
      level: s.level,
      name: s.name,
      filter: s.filter
    })));

    for (const strategy of searchStrategies) {
      console.log(`[CONTENT-BASED] Tentando busca por ${strategy.level}: ${strategy.name}`);

      try {
        const searchUrl = `${INATURE_API}taxa?rank=species&${strategy.filter}&order=desc&order_by=observations_count&per_page=${limit * 3}&locale=pt&photos=true`;
        console.log(`[CONTENT-BASED] URL de busca: ${searchUrl}`);

        const strategyResponse = await fetch(searchUrl);

        if (strategyResponse.ok) {
          const strategyData = await strategyResponse.json();
          console.log(`[CONTENT-BASED] Resposta da API:`, {
            total_results: strategyData.total_results,
            results_length: strategyData.results?.length || 0,
            page: strategyData.page,
            per_page: strategyData.per_page
          });

          if (strategyData.results && strategyData.results.length > 0) {
            console.log(`[CONTENT-BASED] Primeiros 3 resultados:`,
              strategyData.results.slice(0, 3).map(item => ({
                id: item.id,
                name: item.name,
                preferred_common_name: item.preferred_common_name,
                iconic_taxon_name: item.iconic_taxon_name,
                has_photo: !!item.default_photo,
                observations_count: item.observations_count
              }))
            );

            // Filtrar espécies válidas
            const validSpecies = strategyData.results
              .filter(item => {
                const isNotSameSpecies = item.id !== parseInt(speciesId);
                const hasCommonName = item.preferred_common_name || item.name;
                const hasPhoto = item.default_photo?.medium_url;
                const hasObservations = item.observations_count > 10; // Reduzir de 50 para 10
                const isSameGroup = item.iconic_taxon_name === currentGroup;
                const notAlreadySeen = !seenTaxonIds.includes(String(item.id));

                console.log(`[CONTENT-BASED] Avaliando ${item.name}:`, {
                  isNotSameSpecies,
                  hasCommonName,
                  hasPhoto,
                  hasObservations: `${item.observations_count} obs (min: 10)`,
                  isSameGroup: `${item.iconic_taxon_name} === ${currentGroup}`,
                  notAlreadySeen
                });

                return isNotSameSpecies && hasCommonName && hasPhoto && hasObservations && isSameGroup && notAlreadySeen;
              })
              .slice(0, limit);

            console.log(`✅ [CONTENT-BASED] Espécies válidas de ${strategy.level}:`, validSpecies.length);

            if (validSpecies.length >= strategy.minResults) {
              const results = validSpecies.map((item, index) => ({
                taxon_id: item.id,
                common_name: item.preferred_common_name || item.name,
                sci_name: item.name,
                image_url: item.default_photo?.medium_url,
                image_square_url: item.default_photo?.square_url,
                image_medium_url: item.default_photo?.medium_url,
                group: item.iconic_taxon_name,
                family: item.family,
                confidence: 0.95 - (index * 0.05), // Confiança baseada na posição
                recommendation_reason: `Espécie similar da mesma ${strategy.level} (${strategy.name})`
              }));

              console.log(`[CONTENT-BASED] Retornando ${results.length} recomendações baseadas em ${strategy.level}`);
              return res.json({
                results,
                strategy: strategy.level,
                reference_species: {
                  taxon_id: currentSpecies.id,
                  name: currentSpecies.name,
                  group: currentGroup,
                  family: currentFamily
                }
              });
            }

            // Se não tem resultados suficientes, mas tem algum resultado, relaxar critérios
            if (validSpecies.length > 0 && validSpecies.length < strategy.minResults) {
              console.log(`[CONTENT-BASED] Poucos resultados (${validSpecies.length}), mas prosseguindo com ${strategy.level}`);
              const results = validSpecies.map((item, index) => ({
                taxon_id: item.id,
                common_name: item.preferred_common_name || item.name,
                sci_name: item.name,
                image_url: item.default_photo?.medium_url,
                image_square_url: item.default_photo?.square_url,
                image_medium_url: item.default_photo?.medium_url,
                group: item.iconic_taxon_name,
                family: item.family,
                confidence: 0.85 - (index * 0.05), // Confiança um pouco menor
                recommendation_reason: `Espécie similar da mesma ${strategy.level} (${strategy.name})`
              }));

              console.log(`[CONTENT-BASED] Retornando ${results.length} recomendações (relaxadas) baseadas em ${strategy.level}`);
              return res.json({
                results,
                strategy: strategy.level,
                relaxed: true,
                reference_species: {
                  taxon_id: currentSpecies.id,
                  name: currentSpecies.name,
                  group: currentGroup,
                  family: currentFamily
                }
              });
            }
          }
        } else {
          console.error(`[CONTENT-BASED] Erro na busca por ${strategy.level}:`, strategyResponse.status);
          const errorText = await strategyResponse.text();
          console.error(`[CONTENT-BASED] Detalhes do erro:`, errorText.substring(0, 200));
        }
      } catch (err) {
        console.error(`[CONTENT-BASED] Erro ao buscar por ${strategy.level}:`, err.message);
      }
    }

    // 4. Fallback final: buscar qualquer espécie do mesmo grupo sem parent_id
    console.log('[CONTENT-BASED] Tentando fallback final por grupo:', currentGroup);
    if (currentGroup) {
      try {
        // Usar taxon_id específico para melhor precisão
        const groupConfig = GROUPS.find(g => g.id === currentGroup);
        let fallbackUrl;

        if (groupConfig && groupConfig.ancestor_ids && groupConfig.ancestor_ids.length > 0) {
          fallbackUrl = `${INATURE_API}taxa?rank=species&taxon_id=${groupConfig.ancestor_ids[0]}&order=desc&order_by=observations_count&per_page=${limit * 2}&locale=pt&photos=true`;
        } else {
          // Fallback para iconic_taxa se não tiver taxon_id
          fallbackUrl = `${INATURE_API}taxa?rank=species&iconic_taxa=${encodeURIComponent(currentGroup)}&order=desc&order_by=observations_count&per_page=${limit * 2}&locale=pt&photos=true`;
        }

        console.log(`[CONTENT-BASED] URL de fallback: ${fallbackUrl}`);

        const fallbackResponse = await fetch(fallbackUrl);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          console.log(`[CONTENT-BASED] Fallback encontrou ${fallbackData.results?.length || 0} espécies`);

          if (fallbackData.results && fallbackData.results.length > 0) {
            const fallbackResults = fallbackData.results
              .filter(item =>
                item.id !== parseInt(speciesId) &&
                (item.preferred_common_name || item.name) &&
                item.default_photo?.medium_url &&
                !seenTaxonIds.includes(String(item.id))
              )
              .slice(0, limit)
              .map((item, index) => ({
                taxon_id: item.id,
                common_name: item.preferred_common_name || item.name,
                sci_name: item.name,
                image_url: item.default_photo?.medium_url,
                image_square_url: item.default_photo?.square_url,
                image_medium_url: item.default_photo?.medium_url,
                group: item.iconic_taxon_name,
                family: item.family,
                confidence: 0.70 - (index * 0.05),
                recommendation_reason: `Espécie do mesmo grupo (${currentGroup})`
              }));

            if (fallbackResults.length > 0) {
              console.log(`[CONTENT-BASED] Retornando ${fallbackResults.length} recomendações de fallback`);
              return res.json({
                results: fallbackResults,
                strategy: 'fallback-grupo',
                reference_species: {
                  taxon_id: currentSpecies.id,
                  name: currentSpecies.name,
                  group: currentGroup,
                  family: currentFamily
                }
              });
            }
          }
        }
      } catch (fallbackErr) {
        console.error('[CONTENT-BASED] Erro no fallback:', fallbackErr.message);
      }
    }

    // 5. Se nenhuma estratégia funcionou, retornar erro
    console.log('[CONTENT-BASED] Nenhuma estratégia encontrou resultados suficientes');
    return res.json({
      results: [],
      message: 'Não foram encontradas espécies similares suficientes',
      reference_species: {
        taxon_id: currentSpecies.id,
        name: currentSpecies.name,
        group: currentGroup,
        family: currentFamily
      }
    });

  } catch (error) {
    console.error('[CONTENT-BASED] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================
// DISTRIBUIÇÃO GEOGRÁFICA
// ==========================

// Endpoint para buscar distribuição geográfica de uma espécie
app.get('/api/species/:id/distribution', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[DISTRIBUTION] Buscando distribuição para taxon_id: ${id}`);

    // 1. Buscar observações agrupadas por países/lugares principais
    const observationsUrl = `${INATURE_API}observations?taxon_id=${id}&quality_grade=research&per_page=0&return_bounds=true&place_id=any`;
    console.log(`[DISTRIBUTION] URL: ${observationsUrl}`);

    const obsResponse = await fetch(observationsUrl);
    const obsData = await obsResponse.json();

    if (!obsData.total_results || obsData.total_results === 0) {
      console.log(`[DISTRIBUTION] Nenhuma observação encontrada para ${id}`);
      return res.json({
        total_observations: 0,
        countries: [],
        continents: [],
        geographic_range: null,
        message: 'Nenhuma observação de qualidade científica encontrada'
      });
    }

    console.log(`[DISTRIBUTION] Encontradas ${obsData.total_results} observações`);

    // 2. Buscar distribuição por países (places com place_type=country)
    const countriesUrl = `${INATURE_API}observations/histogram?taxon_id=${id}&quality_grade=research&date_field=observed&interval=month&place_id=any`;
    let countriesData = [];

    try {
      // Buscar por continentes primeiro para ter uma visão geral
      const continentsUrl = `${INATURE_API}places/autocomplete?q=&geo=true&order_by=area&per_page=10&place_type=continent`;
      const continentsResponse = await fetch(continentsUrl);
      const continents = await continentsResponse.json();

      const distributionData = {
        total_observations: obsData.total_results,
        countries: [],
        continents: [],
        geographic_range: null
      };

      // 3. Para cada continente, verificar se há observações
      if (continents.results && continents.results.length > 0) {
        console.log(`[DISTRIBUTION] Verificando presença em ${continents.results.length} continentes`);

        for (const continent of continents.results.slice(0, 7)) { // Principais continentes
          try {
            const continentObsUrl = `${INATURE_API}observations?taxon_id=${id}&quality_grade=research&place_id=${continent.id}&per_page=1`;
            const continentObsResponse = await fetch(continentObsUrl);
            const continentObsData = await continentObsResponse.json();

            if (continentObsData.total_results && continentObsData.total_results > 0) {
              distributionData.continents.push({
                name: continent.name,
                observations_count: continentObsData.total_results,
                place_id: continent.id
              });

              // Buscar países deste continente com observações
              const countriesInContinentUrl = `${INATURE_API}places/autocomplete?q=&geo=true&place_type=country&place_id=${continent.id}&per_page=20`;
              const countriesResponse = await fetch(countriesInContinentUrl);
              const countriesInContinent = await countriesResponse.json();

              if (countriesInContinent.results) {
                for (const country of countriesInContinent.results.slice(0, 10)) {
                  try {
                    const countryObsUrl = `${INATURE_API}observations?taxon_id=${id}&quality_grade=research&place_id=${country.id}&per_page=1`;
                    const countryObsResponse = await fetch(countryObsUrl);
                    const countryObsData = await countryObsResponse.json();

                    if (countryObsData.total_results && countryObsData.total_results > 0) {
                      distributionData.countries.push({
                        name: country.name,
                        observations_count: countryObsData.total_results,
                        place_id: country.id,
                        continent: continent.name
                      });
                    }
                  } catch (countryErr) {
                    console.warn(`[DISTRIBUTION] Erro ao verificar país ${country.name}:`, countryErr.message);
                  }
                }
              }
            }
          } catch (continentErr) {
            console.warn(`[DISTRIBUTION] Erro ao verificar continente ${continent.name}:`, continentErr.message);
          }
        }
      }

      // 4. Ordenar por número de observações
      distributionData.countries.sort((a, b) => b.observations_count - a.observations_count);
      distributionData.continents.sort((a, b) => b.observations_count - a.observations_count);

      // 5. Determinar amplitude geográfica
      if (distributionData.continents.length >= 4) {
        distributionData.geographic_range = 'Global';
      } else if (distributionData.continents.length >= 2) {
        distributionData.geographic_range = 'Continental';
      } else if (distributionData.countries.length >= 5) {
        distributionData.geographic_range = 'Regional';
      } else if (distributionData.countries.length >= 2) {
        distributionData.geographic_range = 'Local';
      } else if (distributionData.countries.length >= 1 || distributionData.continents.length >= 1) {
        distributionData.geographic_range = 'Restrita';
      } else {
        distributionData.geographic_range = 'Desconhecida';
      }

      // 6. Limitar resultados para melhor performance na UI - Top 5 países
      distributionData.countries = distributionData.countries.slice(0, 5);
      distributionData.continents = distributionData.continents.slice(0, 7);

      console.log(`[DISTRIBUTION] Distribuição encontrada:`, {
        continents: distributionData.continents.length,
        countries: distributionData.countries.length,
        range: distributionData.geographic_range,
        totalObservations: distributionData.total_observations
      });

      // Se não conseguimos identificar países/continentes específicos, mas há observações
      // vamos tentar uma abordagem alternativa com dados mais gerais
      if (distributionData.countries.length === 0 && distributionData.continents.length === 0 && distributionData.total_observations > 0) {
        console.log(`[DISTRIBUTION] Tentando abordagem alternativa para ${distributionData.total_observations} observações`);

        try {
          // Buscar observações com informações de lugar mais flexíveis
          const flexibleObsUrl = `${INATURE_API}observations?taxon_id=${id}&quality_grade=research&per_page=50&order=desc&order_by=created_at`;
          const flexibleObsResponse = await fetch(flexibleObsUrl);
          const flexibleObsData = await flexibleObsResponse.json();

          if (flexibleObsData.results && flexibleObsData.results.length > 0) {
            const placesFound = new Set();
            const countriesFound = new Set();

            for (const obs of flexibleObsData.results) {
              if (obs.place_guess && obs.place_guess.length > 0) {
                // Extrair informações de lugar a partir do place_guess
                const placeGuess = obs.place_guess;
                const parts = placeGuess.split(',').map(p => p.trim());

                if (parts.length > 0) {
                  const lastPart = parts[parts.length - 1];
                  if (lastPart.length > 2) {
                    countriesFound.add(lastPart);
                  }
                }
              }
            }

            // Adicionar países encontrados via place_guess e tentar obter contagens
            const countryPromises = Array.from(countriesFound).slice(0, 5).map(async (country) => {
              try {
                // Tentar buscar o place_id do país para obter contagem real
                const placeSearchUrl = `${INATURE_API}places/autocomplete?q=${encodeURIComponent(country)}&place_type=country&per_page=1`;
                const placeSearchResponse = await fetch(placeSearchUrl);
                const placeSearchData = await placeSearchResponse.json();

                let observationsCount = 0;
                let placeId = null;

                if (placeSearchData.results && placeSearchData.results.length > 0) {
                  const place = placeSearchData.results[0];
                  placeId = place.id;

                  // Buscar contagem de observações para este país
                  const countryObsUrl = `${INATURE_API}observations?taxon_id=${id}&quality_grade=research&place_id=${place.id}&per_page=1`;
                  const countryObsResponse = await fetch(countryObsUrl);
                  const countryObsData = await countryObsResponse.json();

                  observationsCount = countryObsData.total_results || 0;
                }

                return {
                  name: country,
                  observations_count: observationsCount,
                  place_id: placeId,
                  continent: null,
                  source: 'place_guess_verified'
                };
              } catch (countryErr) {
                console.warn(`[DISTRIBUTION] Erro ao verificar país ${country} via place_guess:`, countryErr.message);
                return {
                  name: country,
                  observations_count: 0,
                  place_id: null,
                  continent: null,
                  source: 'place_guess'
                };
              }
            });

            const countryResults = await Promise.all(countryPromises);

            // Adicionar apenas países com observações ou países únicos encontrados (máximo 5)
            countryResults.forEach(countryData => {
              if (countryData.observations_count > 0 || distributionData.countries.length < 5) {
                distributionData.countries.push(countryData);
              }
            });

            // Garantir que mostramos apenas os top 5 países
            distributionData.countries = distributionData.countries
              .sort((a, b) => b.observations_count - a.observations_count)
              .slice(0, 5);

            // Recalcular amplitude geográfica com base nos dados verificados
            const countriesWithObs = distributionData.countries.filter(c => c.observations_count > 0);

            if (distributionData.continents.length >= 4) {
              distributionData.geographic_range = 'Global';
            } else if (distributionData.continents.length >= 2) {
              distributionData.geographic_range = 'Continental';
            } else if (countriesWithObs.length >= 5) {
              distributionData.geographic_range = 'Regional';
            } else if (countriesWithObs.length >= 2) {
              distributionData.geographic_range = 'Local';
            } else if (countriesWithObs.length >= 1 || distributionData.continents.length >= 1) {
              distributionData.geographic_range = 'Restrita';
            } else if (distributionData.countries.length > 0) {
              // Se temos países identificados mas sem contagens verificadas
              distributionData.geographic_range = 'Limitada';
            } else {
              distributionData.geographic_range = 'Desconhecida';
            }

            console.log(`[DISTRIBUTION] Abordagem alternativa encontrou ${distributionData.countries.length} países:`, {
              total_countries: distributionData.countries.length,
              countries_with_observations: countriesWithObs.length,
              countries_verified: distributionData.countries.filter(c => c.source === 'place_guess_verified').length,
              geographic_range: distributionData.geographic_range
            });
          }
        } catch (altErr) {
          console.warn(`[DISTRIBUTION] Erro na abordagem alternativa:`, altErr.message);
        }
      }

      // Garantir que sempre mostramos apenas os top 5 países no final
      distributionData.countries = distributionData.countries
        .sort((a, b) => b.observations_count - a.observations_count)
        .slice(0, 5);

      res.json(distributionData);

    } catch (placesErr) {
      console.error('[DISTRIBUTION] Erro ao buscar lugares:', placesErr.message);

      // Fallback: retornar apenas dados básicos de observações
      res.json({
        total_observations: obsData.total_results,
        countries: [],
        continents: [],
        geographic_range: obsData.total_results > 1000 ? 'Ampla' : obsData.total_results > 100 ? 'Moderada' : 'Limitada',
        message: 'Dados detalhados de distribuição temporariamente indisponíveis'
      });
    }

  } catch (error) {
    console.error('[DISTRIBUTION] Erro geral:', error.message);
    res.status(500).json({
      error: 'Erro ao buscar dados de distribuição',
      details: error.message
    });
  }
});

// ==========================
// AVALIAÇÕES DE ESPÉCIES
// ==========================

// Endpoint para obter a avaliação do usuário para uma espécie
app.get('/api/species/:id/rating', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT rating, comment, created_at, updated_at FROM species_ratings WHERE user_id = $1 AND taxon_id = $2',
      [userId, id]
    );

    if (result.rows.length > 0) {
      res.json({
        hasRating: true,
        rating: result.rows[0].rating,
        comment: result.rows[0].comment,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at
      });
    } else {
      res.json({
        hasRating: false,
        rating: null,
        comment: null
      });
    }
  } catch (error) {
    console.error('Erro ao buscar avaliação da espécie:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Endpoint para obter estatísticas de avaliações de uma espécie
app.get('/api/species/:id/rating/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_ratings,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as rating_1,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as rating_2,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as rating_3,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as rating_4,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as rating_5
      FROM species_ratings 
      WHERE taxon_id = $1
    `, [id]);

    const stats = result.rows[0];

    res.json({
      total_ratings: parseInt(stats.total_ratings),
      average_rating: stats.average_rating ? parseFloat(stats.average_rating).toFixed(1) : null,
      distribution: {
        1: parseInt(stats.rating_1),
        2: parseInt(stats.rating_2),
        3: parseInt(stats.rating_3),
        4: parseInt(stats.rating_4),
        5: parseInt(stats.rating_5)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de avaliação:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Endpoint para criar ou atualizar uma avaliação de espécie
app.post('/api/species/:id/rating', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { rating, comment = null } = req.body;

    // Validar rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
    }

    // Verificar se já existe uma avaliação
    const existingRating = await pool.query(
      'SELECT id FROM species_ratings WHERE user_id = $1 AND taxon_id = $2',
      [userId, id]
    );

    let result;
    if (existingRating.rows.length > 0) {
      // Atualizar avaliação existente
      result = await pool.query(
        'UPDATE species_ratings SET rating = $1, comment = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $3 AND taxon_id = $4 RETURNING *',
        [rating, comment, userId, id]
      );
    } else {
      // Criar nova avaliação
      result = await pool.query(
        'INSERT INTO species_ratings (user_id, taxon_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, id, rating, comment]
      );
    }

    res.json({
      success: true,
      rating: result.rows[0],
      message: existingRating.rows.length > 0 ? 'Avaliação atualizada com sucesso' : 'Avaliação criada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao salvar avaliação:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Endpoint para remover uma avaliação de espécie
app.delete('/api/species/:id/rating', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM species_ratings WHERE user_id = $1 AND taxon_id = $2 RETURNING *',
      [userId, id]
    );

    if (result.rows.length > 0) {
      res.json({
        success: true,
        message: 'Avaliação removida com sucesso'
      });
    } else {
      res.status(404).json({
        error: 'Avaliação não encontrada'
      });
    }

  } catch (error) {
    console.error('Erro ao remover avaliação:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================
// 7. SISTEMA RAG (RETRIEVAL-AUGMENTED GENERATION)
// ==========================
// Endpoint para enviar espécies para o sistema RAG
app.post('/api/rag/species', authenticateToken, async (req, res) => {
  try {
    const { especies } = req.body;

    console.log('📚 [RAG] Recebendo espécies para indexação:', especies?.length || 0);

    if (!especies || !Array.isArray(especies) || especies.length === 0) {
      return res.status(400).json({
        error: 'É necessário fornecer um array de espécies',
        format: 'especies: [{ taxon_id, nome_comum, nome_cientifico, descricao }]'
      });
    }

    // Validar formato das espécies
    const invalidSpecies = especies.filter(esp =>
      !esp.taxon_id || !esp.nome_comum || !esp.nome_cientifico
    );

    if (invalidSpecies.length > 0) {
      return res.status(400).json({
        error: 'Algumas espécies têm campos obrigatórios em falta',
        required: ['taxon_id', 'nome_comum', 'nome_cientifico'],
        invalid_count: invalidSpecies.length
      });
    }

    // Simular processamento RAG - Integração real com o serviço de IA
    console.log('[RAG] Formatando e enviando espécies para o serviço de IA...', especies.map(e => ({
      taxon_id: String(e.taxon_id), // Mostrar que será convertido para string
      nome_comum: e.nome_comum,
      nome_cientifico: e.nome_cientifico,
      tem_descricao: !!e.descricao && e.descricao.length > 0
    })));

    try {
      // Converter taxon_id para string conforme esperado pelo serviço IA
      const especiesFormatted = especies.map(especie => ({
        ...especie,
        taxon_id: String(especie.taxon_id) // Garantir que taxon_id é string
      }));

      // Enviar para o serviço de IA para indexação no RAG
      const iaResponse = await fetch(`${IA_SERVICE_URL}/api/insert_natura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(especiesFormatted) // Enviar array formatado para o serviço IA
      });

      if (iaResponse.ok) {
        const iaData = await iaResponse.json();
        console.log('[RAG] Espécies enviadas para IA com sucesso:', iaData);
      } else {
        const iaError = await iaResponse.text();
        console.warn('[RAG] Erro na resposta do serviço IA:', iaError);
      }
    } catch (iaError) {
      console.warn('[RAG] Erro ao comunicar com serviço IA:', iaError.message);
      // Continuar mesmo se o RAG falhar
    }

    // Registrar no histórico do usuário
    try {
      for (const especie of especies) {
        await pool.query(
          'INSERT INTO user_species_history (user_id, taxon_id, action) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [req.user.id, especie.taxon_id, 'rag_indexed']
        );
      }
    } catch (historyError) {
      console.warn('[RAG] Erro ao registrar histórico:', historyError.message);
    }

    console.log('[RAG] Espécies processadas e indexadas com sucesso');

    res.json({
      success: true,
      message: `${especies.length} espécie(s) processada(s) e indexada(s) no sistema RAG`,
      processed_count: especies.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[RAG] Erro ao processar espécies:', error);
    res.status(500).json({
      error: 'Erro interno do servidor RAG',
      details: error.message
    });
  }
});

// Endpoint para consultar o sistema RAG
app.post('/api/rag/query', authenticateToken, async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;

    console.log('🔍 [RAG] Recebendo consulta:', query);

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'É necessário fornecer uma consulta (query)'
      });
    }

    // Simular consulta RAG (aqui seria a integração com sistema real)
    console.log('[RAG] Processando consulta:', query);

    // Aguardar um pouco para simular processamento
    await new Promise(resolve => setTimeout(resolve, 800));

    // Resposta simulada
    const mockResults = [
      {
        taxon_id: 12345,
        nome_comum: "Resultado simulado 1",
        nome_cientifico: "Simulatus resultus",
        relevancia: 0.95,
        descricao_resumo: "Este é um resultado simulado baseado na consulta RAG."
      }
    ];

    console.log('[RAG] Consulta processada, retornando', mockResults.length, 'resultados');

    res.json({
      success: true,
      query: query,
      results: mockResults.slice(0, limit),
      total_results: mockResults.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[RAG] Erro ao consultar:', error);
    res.status(500).json({
      error: 'Erro interno do servidor RAG',
      details: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API em http://0.0.0.0:${PORT}`);
});
