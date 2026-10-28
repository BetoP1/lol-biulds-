// app.js — Front-end do LoL Build Finder (JavaScript puro)

// ---------------------------------------------------------------------------
// Referências aos elementos do DOM
// ---------------------------------------------------------------------------
const input = document.getElementById('champion-input');
const laneSelect = document.getElementById('lane-select');
const searchBtn = document.getElementById('search-btn');
const autocompleteBox = document.getElementById('autocomplete');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultEl = document.getElementById('result');

// Guarda a lista completa de campeões (carregada uma vez no início)
let champions = [];

// ---------------------------------------------------------------------------
// 1) Ao carregar a página: busca a lista de campeões para o autocomplete
// ---------------------------------------------------------------------------
async function loadChampions() {
  try {
    const res = await fetch('/api/champions');
    if (!res.ok) throw new Error('Falha ao carregar campeões');
    champions = await res.json();
  } catch (err) {
    // Se falhar, o autocomplete simplesmente não funciona — a busca manual ainda roda.
    console.error('Erro ao carregar lista de campeões:', err);
  }
}
loadChampions();

// ---------------------------------------------------------------------------
// 2) Autocomplete
// ---------------------------------------------------------------------------

// Renderiza as sugestões filtradas na div flutuante
function renderAutocomplete(matches) {
  if (matches.length === 0) {
    autocompleteBox.classList.add('hidden');
    autocompleteBox.innerHTML = '';
    return;
  }

  // Monta os itens da lista (ícone + nome)
  autocompleteBox.innerHTML = matches
    .map(
      (c) => `
      <div class="autocomplete-item" data-name="${c.name}">
        <img src="${c.icon}" alt="${c.name}" />
        <span>${c.name}</span>
      </div>`
    )
    .join('');

  autocompleteBox.classList.remove('hidden');

  // Ao clicar numa sugestão: preenche o input e fecha o dropdown
  autocompleteBox.querySelectorAll('.autocomplete-item').forEach((el) => {
    el.addEventListener('click', () => {
      input.value = el.dataset.name;
      autocompleteBox.classList.add('hidden');
    });
  });
}

// Ao digitar: filtra a lista (case insensitive) e mostra até 6 sugestões
input.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  if (!query) {
    autocompleteBox.classList.add('hidden');
    return;
  }
  const matches = champions
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 6);
  renderAutocomplete(matches);
});

// Fecha o dropdown ao clicar fora do input/sugestões
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-input-wrap')) {
    autocompleteBox.classList.add('hidden');
  }
});

// ---------------------------------------------------------------------------
// 3) Busca da build
// ---------------------------------------------------------------------------

// Alterna a visibilidade dos estados (loading, erro, resultado)
function showLoading() {
  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  resultEl.innerHTML = '';
}

function showError(message) {
  loadingEl.classList.add('hidden');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

async function searchBuild() {
  const champion = input.value.trim();
  const lane = laneSelect.value;

  if (!champion) {
    showError('Digite o nome de um campeão.');
    return;
  }

  autocompleteBox.classList.add('hidden');
  showLoading();

  try {
    // Monta a URL com os query params (lane só é enviada se foi selecionada)
    const params = new URLSearchParams({ champion });
    if (lane) params.append('lane', lane);

    const res = await fetch(`/api/build?${params.toString()}`);
    const data = await res.json();

    loadingEl.classList.add('hidden');

    if (!res.ok) {
      // O back-end devolve { error: "..." } nos casos de falha
      showError(data.error || 'Não foi possível carregar a build.');
      return;
    }

    renderBuild(data);
  } catch (err) {
    console.error('Erro na busca:', err);
    showError('Erro de conexão com o servidor. Tente novamente.');
  }
}

// Dispara a busca no clique do botão e no Enter dentro do input
searchBtn.addEventListener('click', searchBuild);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    autocompleteBox.classList.add('hidden');
    searchBuild();
  }
});

// ---------------------------------------------------------------------------
// 4) Renderização do resultado
// ---------------------------------------------------------------------------
function renderBuild(data) {
  // Helper: formata uma taxa (número) como porcentagem, quando existir
  const pct = (v) =>
    v === null || v === undefined ? '—' : `${Number(v).toFixed(1).replace('.0', '')}%`;

  // ---- Itens principais ----
  const itemsHtml = (data.items || [])
    .map(
      (item) => `
      <div class="item">
        <img class="item-icon" src="${item.icon}" alt="${item.name}" title="${item.name}" />
        <span class="item-name">${item.name}</span>
      </div>`
    )
    .join('');

  // ---- Bota recomendada ----
  const bootsHtml = data.boots
    ? `
      <div class="boots-block">
        <h3 class="section-title">Botas</h3>
        <div class="items-grid">
          <div class="item">
            <img class="item-icon" src="${data.boots.icon}" alt="${data.boots.name}" title="${data.boots.name}" />
            <span class="item-name">${data.boots.name}</span>
          </div>
        </div>
      </div>`
    : '';

  // ---- Runas ----
  // O back-end entrega runes = { primary: [{id,name,icon}], secondary: [...], winRate }.
  // Renderizamos cada runa como um ícone circular com tooltip (atributo title).
  let runesHtml = '';
  if (data.runes && (data.runes.primary?.length || data.runes.secondary?.length)) {
    const runeImg = (r) =>
      `<img class="rune-icon" src="${r.icon}" alt="${r.name}" title="${r.name}"
            onerror="this.style.display='none'" />`;

    const primary = (data.runes.primary || []).map(runeImg).join('');
    const secondary = (data.runes.secondary || []).map(runeImg).join('');

    runesHtml = `
      <h3 class="section-title">Runas</h3>
      <div class="runes-grid">
        ${primary}
        ${secondary ? '<span class="rune-sep">+</span>' + secondary : ''}
      </div>`;
  }

  // ---- Monta o card completo ----
  resultEl.innerHTML = `
    <div class="result-card">
      <div class="result-hero" style="background-image: url('${data.splashUrl}')">
        <div class="hero-content">
          <img class="champ-icon" src="${data.championIcon}" alt="${data.champion}"
               onerror="this.style.display='none'" />
          <div>
            <div class="champ-name">${data.champion}</div>
            <div class="stats">
              ${data.tier ? `<span class="badge tier">Tier ${data.tier}</span>` : ''}
              <span class="badge wr">Win ${pct(data.winRate)}</span>
              <span class="badge pr">Pick ${pct(data.pickRate)}</span>
              ${data.banRate != null ? `<span class="badge br">Ban ${pct(data.banRate)}</span>` : ''}
              ${data.lane ? `<span class="badge lane">${data.lane}</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="result-body">
        <h3 class="section-title">Itens principais</h3>
        <div class="items-grid">${itemsHtml || '<span class="runes-raw">Nenhum item retornado.</span>'}</div>
        ${bootsHtml}
        ${runesHtml}
      </div>
    </div>`;
}

// ===========================================================================
// 5) Test your LOLcky — aba de sorteio de destino
// ===========================================================================

// ---- Estado da aba ----
let luckyMode = 'chaos';
let rerollsLeft = 2;
let lastLuckyResult = null;
let rouletteInterval = null;

// ---- Referências do DOM ----
const rouletteStrip = document.getElementById('roulette-strip');
const rouletteSlots = rouletteStrip ? Array.from(rouletteStrip.querySelectorAll('.roulette-slot')) : [];
const btnLucky = document.getElementById('btn-lucky');
const btnReroll = document.getElementById('btn-reroll');
const rerollCountEl = document.getElementById('reroll-count');
const luckyLoading = document.getElementById('lucky-loading');
const luckyResult = document.getElementById('lucky-result');
const btnShare = document.getElementById('btn-share');

// ---------------------------------------------------------------------------
// Navegação entre abas
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    // Alterna a classe ativa dos botões
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    // Mostra apenas a seção correspondente
    document.querySelectorAll('.tab-content').forEach((sec) => {
      sec.classList.toggle('hidden', sec.id !== target);
    });
  });
});

// ---------------------------------------------------------------------------
// Seletor de modo (toggle entre Caos e Meta)
// ---------------------------------------------------------------------------
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    luckyMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

// ---------------------------------------------------------------------------
// Roleta de campeões
// ---------------------------------------------------------------------------

// Pega um campeão aleatório da lista carregada (champions, do autocomplete)
function randomChampion() {
  return champions[Math.floor(Math.random() * champions.length)];
}

// Começa a animação: a cada 80ms sorteia 7 campeões e injeta os ícones
function startRoulette() {
  if (!rouletteSlots.length || !champions.length) return;
  clearInterval(rouletteInterval);
  rouletteSlots.forEach((slot) => slot.classList.remove('active', 'dim'));

  const spin = () => {
    rouletteSlots.forEach((slot) => {
      const c = randomChampion();
      slot.innerHTML = `<img src="${c.icon}" alt="${c.name}" />`;
      slot.classList.add('flash');
    });
  };
  spin();
  rouletteInterval = setInterval(spin, 80);
}

// Para a animação desacelerando e fixa o campeão sorteado no slot central (index 3)
function stopRoulette(finalChampion) {
  clearInterval(rouletteInterval);

  // Fase de desaceleração: ~500ms girando mais devagar (200ms por giro)
  let slow = 0;
  const slowInterval = setInterval(() => {
    rouletteSlots.forEach((slot) => {
      const c = randomChampion();
      slot.innerHTML = `<img src="${c.icon}" alt="${c.name}" />`;
    });
    slow++;
    if (slow >= 2) {
      clearInterval(slowInterval);
      // Fixa o resultado no slot central e escurece os demais
      rouletteSlots.forEach((slot, i) => {
        slot.classList.remove('flash', 'active', 'dim');
        if (i === 3) {
          slot.innerHTML = `<img src="${finalChampion.icon}" alt="${finalChampion.name}" />`;
          slot.classList.add('active');
        } else {
          const c = randomChampion();
          slot.innerHTML = `<img src="${c.icon}" alt="${c.name}" />`;
          slot.classList.add('dim');
        }
      });
    }
  }, 200);
}

// ---------------------------------------------------------------------------
// Busca do sorteio
// ---------------------------------------------------------------------------
async function fetchLucky() {
  luckyLoading.classList.remove('hidden');
  luckyResult.classList.add('hidden');
  btnShare.classList.add('hidden');

  startRoulette();

  try {
    const res = await fetch(`/api/lucky?mode=${luckyMode}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Falha no sorteio.');

    // Normaliza nome/ícone do campeão (meta devolve string + championIcon; caos devolve objeto)
    const champ =
      typeof data.champion === 'object'
        ? data.champion
        : { name: data.champion, icon: data.championIcon };

    stopRoulette(champ);
    setTimeout(() => {
      luckyLoading.classList.add('hidden');
      renderLuckyResult(data);
    }, 800);
  } catch (err) {
    console.error('Erro no sorteio:', err);
    clearInterval(rouletteInterval);
    luckyLoading.classList.add('hidden');
    luckyResult.classList.remove('hidden');
    luckyResult.innerHTML = `<div class="error">${err.message || 'Erro ao sortear. Tente novamente.'}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Rerolls
// ---------------------------------------------------------------------------
function updateRerollBadge() {
  rerollCountEl.textContent = `🔄 Rerolls: ${rerollsLeft}`;
  if (rerollsLeft <= 0) {
    btnReroll.disabled = true;
    btnReroll.textContent = '🔄 Sem rerolls';
  }
}

if (btnLucky) {
  btnLucky.addEventListener('click', () => {
    // Novo sorteio "do zero" reabilita os rerolls
    rerollsLeft = 2;
    btnReroll.disabled = false;
    btnReroll.textContent = 'Usar Reroll';
    updateRerollBadge();
    fetchLucky();
  });
}

if (btnReroll) {
  btnReroll.addEventListener('click', () => {
    if (rerollsLeft <= 0) return;
    rerollsLeft--;
    updateRerollBadge();
    fetchLucky();
  });
}

// ---------------------------------------------------------------------------
// Renderização do resultado do sorteio
// ---------------------------------------------------------------------------
function renderLuckyResult(data) {
  lastLuckyResult = data;

  const pct = (v) =>
    v === null || v === undefined ? '—' : `${Number(v).toFixed(1).replace('.0', '')}%`;

  // Normaliza campeão / splash (difere entre os modos)
  const isMeta = data.mode === 'meta';
  const champName = typeof data.champion === 'object' ? data.champion.name : data.champion;
  const champIcon = typeof data.champion === 'object' ? data.champion.icon : data.championIcon;
  const splashUrl = typeof data.champion === 'object' ? data.champion.splashUrl : data.splashUrl;

  const modeBadge = isMeta ? '📊 Semi-LOLcky' : '💀 Modo Caos';
  const modeClass = isMeta ? 'badge-meta' : 'badge-chaos';

  // Grid dos 6 itens
  const itemsHtml = (data.items || [])
    .map(
      (item) => `
      <div class="item">
        <img class="item-icon" src="${item.icon}" alt="${item.name}" title="${item.name}"
             onerror="this.style.display='none'" />
        <span class="item-name">${item.name}</span>
      </div>`
    )
    .join('');

  // Bota sorteada
  const bootsHtml = data.boots
    ? `
      <h3 class="section-title">Botas</h3>
      <div class="items-grid">
        <div class="item">
          <img class="item-icon" src="${data.boots.icon}" alt="${data.boots.name}" title="${data.boots.name}"
               onerror="this.style.display='none'" />
          <span class="item-name">${data.boots.name}</span>
        </div>
      </div>`
    : '';

  // Stats extra só no modo meta
  const metaStats = isMeta
    ? `
      <span class="badge wr">Win ${pct(data.winRate)}</span>
      ${data.tier ? `<span class="badge tier">Tier ${data.tier}</span>` : ''}`
    : '';

  luckyResult.innerHTML = `
    <div class="result-card">
      <div class="result-hero" style="background-image: url('${splashUrl}')">
        <div class="hero-content">
          <img class="champ-icon" src="${champIcon}" alt="${champName}"
               onerror="this.style.display='none'" />
          <div>
            <div class="champ-name">${champName}</div>
            <div class="stats">
              <span class="badge ${modeClass}">${modeBadge}</span>
              <span class="badge lane">${data.lane}</span>
              ${metaStats}
            </div>
          </div>
        </div>
      </div>

      <div class="result-body">
        <h3 class="section-title">Itens</h3>
        <div class="items-grid">${itemsHtml || '<span class="runes-raw">Nenhum item sorteado.</span>'}</div>
        ${bootsHtml}
      </div>
    </div>`;

  luckyResult.classList.remove('hidden');
  btnShare.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Compartilhar o desafio
// ---------------------------------------------------------------------------
if (btnShare) {
  btnShare.addEventListener('click', async () => {
    if (!lastLuckyResult) return;
    const d = lastLuckyResult;
    const champName = typeof d.champion === 'object' ? d.champion.name : d.champion;
    const buildStr = (d.items || []).map((i) => i.name).join(' → ');
    const bootsStr = d.boots ? d.boots.name : '—';

    const text =
      `🎲 Test your LOLcky!\n` +
      `🏆 Campeão: ${champName} · Rota: ${d.lane}\n` +
      `⚔️ Build: ${buildStr}\n` +
      `👟 Botas: ${bootsStr}\n\n` +
      `Sorteado pelo LoL Build Finder 🎲`;

    try {
      await navigator.clipboard.writeText(text);
      const original = btnShare.textContent;
      btnShare.textContent = '✅ Copiado!';
      setTimeout(() => {
        btnShare.textContent = original;
      }, 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  });
}
