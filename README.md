# LoL Build Finder

> Pesquise a melhor build META de qualquer campeão de League of Legends — com ícones dos itens, runas e estatísticas do patch atual. E se quiser zoar com os amigos, role o dado no **Test your LOLcky** 🎲

---

## Funcionalidades

### Build Finder
- Busca por nome do campeão com **autocomplete**
- Filtro por **rota** (Top, Jungle, Mid, Bot, Support)
- Exibe os **ícones dos itens** principais, botas e runas
- Mostra **win rate**, **pick rate** e **tier** do campeão no patch atual
- Dados sempre atualizados — sem nada hard-coded

### Test your LOLcky
- **Modo Caos** — campeão, rota e itens 100% aleatórios. Pode sair o que for.
- **Modo Semi-LOLcky** — campeão e rota aleatórios, mas com a build META real
- Animação de **roleta** com suspense antes do reveal
- **2 rerolls** por sessão — use com sabedoria
- Botão de **copiar desafio** pronto pra mandar no grupo

---

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Back-end | Node.js + Express |
| Front-end | HTML, CSS e JavaScript puro |
| Requisições | Axios |
| Dados META | [Lolalytics](https://lolalytics.com) |
| Assets visuais | [Riot Data Dragon](https://developer.riotgames.com/docs/lol) |

---

## Como rodar localmente

### Pré-requisitos
- [Node.js](https://nodejs.org) instalado (versão 18 ou superior)

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/lol-build-finder.git

# 2. Entre na pasta do projeto
cd lol-build-finder

# 3. Instale as dependências
npm install

# 4. Inicie o servidor
npm start
```

Abra o navegador em **http://localhost:3000** e pronto! 🎉

---

## Estrutura do projeto

```
lol-build-finder/
│
├── server.js          # Servidor Express + endpoints da API
├── package.json       # Dependências do projeto
│
└── public/            # Arquivos servidos ao navegador
    ├── index.html     # Interface principal
    ├── style.css      # Visual dark temático
    └── app.js         # Lógica do front-end (busca, roleta, autocomplete)
```

---

##  Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/champions` | Lista todos os campeões com ícones |
| `GET` | `/api/build?champion=ahri&lane=mid` | Build META do campeão na rota |
| `GET` | `/api/lucky?mode=chaos` | Sorteia campeão + itens aleatórios |
| `GET` | `/api/lucky?mode=meta` | Sorteia campeão + build META real |

---

## Test your LOLcky — Como funciona

1. Acesse a aba **Test your LOLcky** no site
2. Escolha o modo: **Caos** (tudo aleatório) ou **Semi-LOLcky** (campeão aleatório + META)
3. Clique em **Sortear Destino** e aguarde a roleta
4. Aceite seu destino — ou use um dos **2 rerolls**
5. Copie o resultado e mande no grupo: sem desculpas, todo mundo joga

---

## 📡 Fontes de dados

- **[Riot Data Dragon](https://developer.riotgames.com/docs/lol)** — ícones de itens, runas e imagens dos campeões. API oficial da Riot, gratuita e sem necessidade de chave de API.
- **[Lolalytics](https://lolalytics.com)** — estatísticas META coletadas de milhões de partidas ranqueadas. Atualizado a cada patch.

> ⚠️ Este projeto não tem afiliação com a Riot Games. League of Legends é propriedade da Riot Games. Apenas um projeto para aprendizado e brincar 

---

## 🤝 Contribuindo

Tem alguma ideia ou encontrou um bug? Abre uma [issue](https://github.com/seu-usuario/lol-build-finder/issues) ou manda um pull request!

Algumas ideias pra implementações futuras:
- [ ] Timer de aceitação no LOLcky (menos chance)
- [ ] Histórico das últimas builds sorteadas
- [ ] Filtro de campeões por dificuldade no LOLcky
- [ ] Modo multiplayer — cada amigo recebe um sorteio diferente
- [ ] Versão mobile como PWA

---

<p align="center">Feito com ☕ e muito <em>int feeding</em></p>
