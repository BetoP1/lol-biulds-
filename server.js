// server.js — Back-end do LoL Build Finder (Node.js + Express)
// Serve o front-end estático e expõe dois endpoints:
//   GET /api/champions  -> lista de campeões (para o autocomplete)
//   GET /api/build      -> build META de um campeão (dados do Lolalytics + ícones do Data Dragon)

const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// URLs base do Riot Data Dragon (assets oficiais e gratuitos)
const DDRAGON = 'https://ddragon.leagueoflegends.com';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// CORS liberado para qualquer origem (o front-end é servido pelo mesmo servidor,
// mas deixamos liberado caso queira consumir a API de outro lugar)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Serve os arquivos estáticos da pasta public/
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Cache simples em memória para a versão do patch (evita bater no Data Dragon
// a cada request). Guardamos a versão e o momento em que foi buscada.
let versionCache = { value: null, fetchedAt: 0 };
const VERSION_TTL = 1000 * 60 * 60; // 1 hora

// Busca a versão mais recente do Data Dragon (primeiro item do array de versões)
async function getLatestVersion() {
  const now = Date.now();
  if (versionCache.value && now - versionCache.fetchedAt < VERSION_TTL) {
    return versionCache.value;
  }
  const { data } = await axios.get(`${DDRAGON}/api/versions.json`);
  const version = data[0]; // o primeiro item é sempre a versão mais recente
  versionCache = { value: version, fetchedAt: now };
  return version;
}

// Normaliza o nome do campeão: minúsculas, sem espaços, sem acentos/caracteres especiais
// Ex.: "Aurelion Sol" -> "aurelionsol", "Kai'Sa" -> "kaisa", "Nunu & Willump" -> "nunuwillump"
function normalizeChampionName(name) {
  return String(name)
    .normalize('NFD')               // separa letras de acentos
    .replace(/[̀-ͯ]/g, '') // remove os acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');     // remove tudo que não for letra/número
}

// Cache do mapa de itens (id -> nome) por versão, para traduzir os IDs do Lolalytics
const itemNameCache = {}; // { [version]: { [id]: name } }

// Busca o item.json do Data Dragon e devolve um mapa id -> nome (em pt_BR)
async function getItemNames(version) {
  if (itemNameCache[version]) return itemNameCache[version];
  const { data } = await axios.get(`${DDRAGON}/cdn/${version}/data/pt_BR/item.json`);
  const map = {};
  for (const [id, info] of Object.entries(data.data)) {
    map[id] = info.name;
  }
  itemNameCache[version] = map;
  return map;
}

// Cache do conjunto de IDs que são botas (detectado pela tag "Boots" do item.json).
// Isso é robusto entre patches, sem depender de uma lista fixa de IDs.
const bootIdsCache = {};
async function getBootIds(version) {
  if (bootIdsCache[version]) return bootIdsCache[version];
  const { data } = await axios.get(`${DDRAGON}/cdn/${version}/data/pt_BR/item.json`);
  const boots = new Set();
  for (const [id, info] of Object.entries(data.data)) {
    if (info.tags && info.tags.includes('Boots')) boots.add(id);
  }
  bootIdsCache[version] = boots;
  return boots;
}

// Monta a URL do ícone de um item
function itemIcon(version, id) {
  return `${DDRAGON}/cdn/${version}/img/item/${id}.png`;
}

// Converte um ID de item em um objeto { id, name, icon }
function buildItemObject(version, itemNames, id) {
  return {
    id,
    name: itemNames[id] || `Item ${id}`,
    icon: itemIcon(version, id),
  };
}

// Cache do mapa nome-normalizado -> id do Data Dragon (ex.: "aurelionsol" -> "AurelionSol")
const championIdCache = {};
async function getChampionIdMap(version) {
  if (championIdCache[version]) return championIdCache[version];
  const { data } = await axios.get(`${DDRAGON}/cdn/${version}/data/pt_BR/champion.json`);
  const map = {};
  for (const champ of Object.values(data.data)) {
    // Indexamos tanto pelo id normalizado quanto pelo nome normalizado,
    // para casar com o que o usuário digitar (ex.: "monkeyking" ou "wukong").
    const entry = { id: champ.id, name: champ.name };
    map[normalizeChampionName(champ.id)] = entry;
    map[normalizeChampionName(champ.name)] = entry;
  }
  championIdCache[version] = map;
  return map;
}

// Cache do mapa id-da-runa -> { name, icon } (a partir do runesReforged.json)
const runeMapCache = {};
async function getRuneMap(version) {
  if (runeMapCache[version]) return runeMapCache[version];
  const { data } = await axios.get(`${DDRAGON}/cdn/${version}/data/pt_BR/runesReforged.json`);
  const map = {};
  // Cada "árvore" (Domination, Sorcery...) tem slots, e cada slot tem runas.
  for (const tree of data) {
    // A própria árvore também tem ícone (usado como runa secundária/estilo)
    map[tree.id] = {
      name: tree.name,
      icon: `${DDRAGON}/cdn/img/${tree.icon}`,
    };
    for (const slot of tree.slots) {
      for (const rune of slot.runes) {
        map[rune.id] = {
          name: rune.name,
          icon: `${DDRAGON}/cdn/img/${rune.icon}`,
        };
      }
    }
  }
  runeMapCache[version] = map;
  return map;
}

// Faz uma chamada ao endpoint interno "mega" do Lolalytics para um dado "ep".
// Lança erro se a resposta não for um objeto válido (o Lolalytics devolve
// "invalid end point" em texto quando o ep não existe).
async function megaRequest(ep, { champion, patch, lane }) {
  const params = {
    ep,
    v: 1,
    patch,
    c: champion,
    tier: 'emerald_plus', // faixa de elo analisada
    queue: 420,           // 420 = Ranked Solo/Duo
    region: 'all',
  };
  // Só enviamos a lane quando ela é específica; omitindo-a, o Lolalytics
  // resolve automaticamente a lane principal do campeão.
  if (lane) params.lane = lane;

  const { data } = await axios.get('https://a1.lolalytics.com/mega/', {
    params,
    headers: { Accept: 'application/json' },
    timeout: 15000,
  });

  // Quando o ep é inválido, a resposta vem como string (print_r do PHP), não objeto.
  if (!data || typeof data !== 'object') {
    throw new Error(`Resposta inválida do Lolalytics para ep=${ep}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// GET /api/champions  — lista de campeões para o autocomplete
// ---------------------------------------------------------------------------
app.get('/api/champions', async (req, res) => {
  try {
    const version = await getLatestVersion();
    const { data } = await axios.get(`${DDRAGON}/cdn/${version}/data/pt_BR/champion.json`);

    // data.data é um objeto { Aatrox: {...}, Ahri: {...}, ... }
    const champions = Object.values(data.data).map((champ) => ({
      id: champ.id,       // ex.: "Ahri" (usado nas URLs de ícone/splash)
      name: champ.name,   // nome localizado, ex.: "Ahri"
      icon: `${DDRAGON}/cdn/${version}/img/champion/${champ.id}.png`,
    }));

    res.json(champions);
  } catch (err) {
    console.error('Erro em /api/champions:', err.message);
    res.status(502).json({ error: 'Não foi possível carregar a lista de campeões do Data Dragon.' });
  }
});

// Embaralhamento in-place (Fisher-Yates) — usado pelo Modo Caos do /api/lucky
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ---------------------------------------------------------------------------
// computeBuild — núcleo da build META de um campeão.
// Devolve { status, body }, onde status é o HTTP status e body é o JSON.
// É usado tanto por /api/build quanto por /api/lucky (modo "meta").
// ---------------------------------------------------------------------------
async function computeBuild(rawChampion, laneInput) {
  const lane = laneInput || 'default'; // Lolalytics usa "default" quando não há lane específica

  if (!rawChampion) {
    return { status: 400, body: { error: 'Parâmetro "champion" é obrigatório.' } };
  }

  const champion = normalizeChampionName(rawChampion);

  // O Lolalytics usa nomes de lane diferentes dos values do front-end.
  // "default" (ou vazio) significa "deixe o Lolalytics escolher a lane principal",
  // o que fazemos simplesmente NÃO enviando o parâmetro lane.
  const laneMap = {
    top: 'top',
    jungle: 'jungle',
    mid: 'middle',
    bot: 'bottom',
    support: 'support',
  };
  const lolLane = laneMap[lane] || null; // null = lane principal automática

  try {
    const version = await getLatestVersion();

    // O Lolalytics identifica o patch no formato "major.minor" (ex.: "16.21"),
    // enquanto o Data Dragon usa "16.21.1". Convertemos pegando os dois primeiros números.
    const patch = version.split('.').slice(0, 2).join('.');
    const megaArgs = { champion, patch, lane: lolLane };

    // ------------------------------------------------------------------
    // 1) Busca os dados META no Lolalytics (3 endpoints internos "mega",
    //    em paralelo). Cada "ep" entrega uma parte da build:
    //      - counter       -> estatísticas (win rate, pick rate, ban rate, lane)
    //      - build-itemset  -> sequências de itens e botas mais populares
    //      - rune           -> páginas de runas (mais pegada e maior win rate)
    // ------------------------------------------------------------------
    let statsData, itemData, runeData;
    try {
      [statsData, itemData, runeData] = await Promise.all([
        megaRequest('counter', megaArgs),
        megaRequest('build-itemset', megaArgs),
        megaRequest('rune', megaArgs),
      ]);
    } catch (lolErr) {
      // Logamos o objeto/erro para análise, como pedido, e devolvemos erro claro.
      console.error('Erro ao consultar o Lolalytics:', lolErr.message);
      return {
        status: 502,
        body: {
          error:
            'Falha ao obter dados do Lolalytics. O serviço pode estar indisponível ou o campeão/lane informado não existe.',
          detail: lolErr.message,
        },
      };
    }

    // Carrega os mapas de tradução (nomes de itens, ids de campeão, runas, botas)
    const [itemNames, championIdMap, runeMap, bootIds] = await Promise.all([
      getItemNames(version),
      getChampionIdMap(version),
      getRuneMap(version),
      getBootIds(version),
    ]);

    // ------------------------------------------------------------------
    // 2) Estatísticas (ep=counter -> stats)
    // ------------------------------------------------------------------
    const stats = statsData.stats || {};
    const winRate = stats.wr != null ? Number(stats.wr) : null;
    const pickRate = stats.pr != null ? Number(stats.pr) : null;
    const banRate = stats.br != null ? Number(stats.br) : null;
    // Lane efetivamente usada (resolvida pelo Lolalytics quando pedimos a automática)
    const resolvedLane = stats.lane || lolLane || 'default';

    // ------------------------------------------------------------------
    // 3) Itens principais (ep=build-itemset -> itemSets)
    //    Cada itemSetN contém builds cumulativas de N itens, no formato
    //    [ "id1_id2_...", jogos, vitorias ], ordenadas por popularidade.
    //    Escolhemos a build mais "completa" que ainda tenha amostra relevante.
    // ------------------------------------------------------------------
    const itemSets = itemData.itemSets || {};

    // Pega a primeira entrada (mais popular) de um conjunto, ou null
    const topEntry = (set) => (Array.isArray(set) && set.length ? set[0] : null);

    // Quantidade de jogos do item mais popular (referência para o "corte" de amostra)
    const baseGames = (() => {
      const e = topEntry(itemSets.itemSet1);
      return e ? e[1] : 0;
    })();
    const threshold = Math.max(100, baseGames * 0.03); // amostra mínima aceitável

    // Procura do conjunto mais completo (5 itens) ao mais simples (1 item).
    // Esses conjuntos (itemSetN) são os itens "core", sem contar as botas.
    let items = [];
    for (let n = 5; n >= 1; n--) {
      const entry = topEntry(itemSets[`itemSet${n}`]);
      if (entry && entry[1] >= threshold) {
        items = String(entry[0])
          .split('_')
          .filter((id) => !bootIds.has(id)) // remove botas que por acaso apareçam aqui
          .map((id) => buildItemObject(version, itemNames, id));
        break;
      }
    }

    // Botas recomendadas: as builds "itemBootSetN" incluem as botas no meio dos itens.
    // Varremos todas e escolhemos a bota mais jogada (ponderando pelo nº de partidas).
    const bootCounts = {};
    for (let n = 1; n <= 6; n++) {
      const entry = topEntry(itemSets[`itemBootSet${n}`]);
      if (!entry) continue;
      for (const id of String(entry[0]).split('_')) {
        if (bootIds.has(id)) bootCounts[id] = (bootCounts[id] || 0) + entry[1];
      }
    }
    const bestBootId = Object.entries(bootCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const boots = bestBootId ? buildItemObject(version, itemNames, bestBootId) : null;

    // ------------------------------------------------------------------
    // 4) Runas (ep=rune -> summary.runes)
    //    Pegamos a página mais popular (pick). Estrutura:
    //      set: { pri: [ids], sec: [ids], mod: [shards] }
    // ------------------------------------------------------------------
    const runesSummary = runeData.summary?.runes || {};
    const chosenPage = runesSummary.pick || runesSummary.win || null;

    const mapRunes = (ids) =>
      (Array.isArray(ids) ? ids : [])
        .filter((id) => runeMap[id]) // ignora shards (não estão no runesReforged)
        .map((id) => ({ id, name: runeMap[id].name, icon: runeMap[id].icon }));

    let runes = null;
    if (chosenPage && chosenPage.set) {
      runes = {
        primary: mapRunes(chosenPage.set.pri),   // árvore principal (keystone + 3 runas)
        secondary: mapRunes(chosenPage.set.sec), // árvore secundária (2 runas)
        winRate: chosenPage.wr != null ? Number(chosenPage.wr) : null,
      };
    }

    // Se não veio nada de útil, provavelmente o campeão (ou a lane) não existe.
    if (!items.length && winRate == null && !runes) {
      return {
        status: 404,
        body: {
          error: `Sem dados para "${rawChampion}"${
            lolLane ? ` na lane ${lane}` : ''
          }. Verifique o nome do campeão (e a lane).`,
        },
      };
    }

    // ------------------------------------------------------------------
    // 5) Id do campeão no formato do Data Dragon (PascalCase) p/ ícone e splash
    // ------------------------------------------------------------------
    const champEntry = championIdMap[champion];
    const championId = champEntry ? champEntry.id : rawChampion.replace(/\s+/g, '');
    const championName = champEntry ? champEntry.name : rawChampion;

    // ------------------------------------------------------------------
    // 6) Monta e devolve o JSON final
    // ------------------------------------------------------------------
    return {
      status: 200,
      body: {
        champion: championName,
        championId,
        lane: resolvedLane,
        patch: version,
        items,
        boots,
        runes,
        winRate,
        pickRate,
        banRate,
        tier: null, // o endpoint mega não expõe o "tier" (S/A/B); não inventamos o valor
        championIcon: `${DDRAGON}/cdn/${version}/img/champion/${championId}.png`,
        splashUrl: `${DDRAGON}/cdn/img/champion/splash/${championId}_0.jpg`,
      },
    };
  } catch (err) {
    console.error('Erro inesperado em computeBuild:', err.message);
    return { status: 500, body: { error: 'Erro interno ao montar a build.', detail: err.message } };
  }
}

// ---------------------------------------------------------------------------
// GET /api/build — build META de um campeão
// Query params: champion (obrigatório), lane (opcional)
// ---------------------------------------------------------------------------
app.get('/api/build', async (req, res) => {
  const { status, body } = await computeBuild(req.query.champion, req.query.lane);
  res.status(status).json(body);
});

// ---------------------------------------------------------------------------
// GET /api/lucky — "Test your LOLcky": sorteia campeão + rota e devolve uma build
// Query params: mode = "chaos" (itens aleatórios) | "meta" (build real do Lolalytics)
// ---------------------------------------------------------------------------
app.get('/api/lucky', async (req, res) => {
  const mode = req.query.mode === 'meta' ? 'meta' : 'chaos';

  try {
    const version = await getLatestVersion();

    // Sorteia um campeão aleatório a partir do champion.json do Data Dragon
    const { data: champData } = await axios.get(
      `${DDRAGON}/cdn/${version}/data/pt_BR/champion.json`
    );
    const allChamps = Object.values(champData.data);
    const champ = allChamps[Math.floor(Math.random() * allChamps.length)];

    // Sorteia uma rota aleatória
    const lanes = ['top', 'jungle', 'mid', 'bot', 'support'];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];

    // ------------------------------------------------------------------
    // Modo META: reutiliza a lógica de /api/build com o campeão/rota sorteados
    // ------------------------------------------------------------------
    if (mode === 'meta') {
      const { status, body } = await computeBuild(champ.id, lane);
      if (status !== 200) {
        // Sem dados META para essa combinação (campeão/rota improvável) — devolvemos o erro.
        return res.status(status).json({ ...body, champion: champ.name, lane, mode: 'meta' });
      }
      return res.json({ ...body, champion: champ.name, lane, mode: 'meta' });
    }

    // ------------------------------------------------------------------
    // Modo CAOS: itens aleatórios compráveis da loja (mapa Summoner's Rift)
    // ------------------------------------------------------------------
    const { data: itemData } = await axios.get(
      `${DDRAGON}/cdn/${version}/data/pt_BR/item.json`
    );

    // Filtra apenas itens realmente compráveis na loja da Summoner's Rift (mapa "11")
    const buyable = [];
    for (const [id, info] of Object.entries(itemData.data)) {
      const gold = info.gold || {};
      if (gold.purchasable !== true) continue;
      if (!(gold.total > 0)) continue;
      if (!(info.maps && info.maps['11'] === true)) continue;
      buyable.push({ id, info });
    }

    // Separa as botas (tag "Boots") dos demais itens
    const boots = buyable.filter((it) => it.info.tags && it.info.tags.includes('Boots'));
    const normals = buyable.filter((it) => !(it.info.tags && it.info.tags.includes('Boots')));

    // Monta {id, name, icon} a partir de uma entrada da lista acima
    const toItem = ({ id, info }) => ({
      id,
      name: info.name,
      icon: `${DDRAGON}/cdn/${version}/img/item/${id}.png`,
    });

    // Embaralha os itens normais e pega os 6 primeiros; sorteia 1 bota
    const chosenItems = shuffle(normals.slice()).slice(0, 6).map(toItem);
    const chosenBoots = boots.length
      ? toItem(boots[Math.floor(Math.random() * boots.length)])
      : null;

    return res.json({
      champion: {
        id: champ.id,
        name: champ.name,
        icon: `${DDRAGON}/cdn/${version}/img/champion/${champ.id}.png`,
        splashUrl: `${DDRAGON}/cdn/img/champion/splash/${champ.id}_0.jpg`,
      },
      lane,
      items: chosenItems,
      boots: chosenBoots,
      mode: 'chaos',
    });
  } catch (err) {
    console.error('Erro em /api/lucky:', err.message);
    res.status(502).json({ error: 'Não foi possível sortear seu destino. Tente novamente.', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// Inicia o servidor
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Servidor LoL Build Finder rodando em http://localhost:${PORT}`);
});
