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
