const HEROES_URL = "https://api.opendota.com/api/heroes";
const MATCHUPS_URL = "https://api.opendota.com/api/heroes";
const CDN_BASE = "https://cdn.cloudflare.steamstatic.com";
const CACHE_TTL = 1000 * 60 * 60 * 12;

const grid = document.querySelector("#hero-grid");
const status = document.querySelector("#status");
const searchInput = document.querySelector("#hero-search");
const allySlots = document.querySelector("#ally-slots");
const enemySlots = document.querySelector("#enemy-slots");
const teamToggle = document.querySelector("#team-toggle");
const analyzeButton = document.querySelector("#analyze-button");
const analysisStatus = document.querySelector("#analysis-status");
const recommendations = document.querySelector("#recommendations");
const stratzKeyInput = document.querySelector("#stratz-key");

let heroes = [];
let selectedTeam = "ally";
const picks = {
  ally: [],
  enemy: [],
};

function normalizeRole(hero) {
  if (!hero.roles || hero.roles.length === 0) {
    return "Роль не указана";
  }
  return hero.roles[0];
}

function saveCache(key, data) {
  localStorage.setItem(key, JSON.stringify({
    ts: Date.now(),
    data,
  }));
}

function loadCache(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch (error) {
    localStorage.removeItem(key);
    return null;
  }
}

function heroCard(hero) {
  const card = document.createElement("article");
  card.className = "hero-card";
  card.dataset.heroId = hero.id;

  const img = document.createElement("img");
  img.src = `${CDN_BASE}${hero.img}`;
  img.alt = hero.localized_name;
  img.loading = "lazy";

  const info = document.createElement("div");
  info.className = "hero-info";

  const name = document.createElement("h3");
  name.textContent = hero.localized_name;

  const role = document.createElement("div");
  role.className = "hero-role";
  role.textContent = normalizeRole(hero);

  info.append(name, role);
  card.append(img, info);

  card.addEventListener("click", () => handleHeroPick(hero));

  return card;
}

function renderHeroes(list) {
  grid.innerHTML = "";
  if (list.length === 0) {
    grid.innerHTML = "<p>Героев не найдено.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((hero) => fragment.append(heroCard(hero)));
  grid.append(fragment);
}

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = heroes.filter((hero) =>
    hero.localized_name.toLowerCase().includes(query)
  );
  renderHeroes(filtered);
}

function updateTeamSlots() {
  const createSlot = (hero, team, index) => {
    const slot = document.createElement("div");
    slot.className = "team-slot";

    if (!hero) {
      const label = document.createElement("div");
      label.className = "slot-name";
      label.textContent = "Пусто";
      slot.append(label);
      return slot;
    }

    const img = document.createElement("img");
    img.src = `${CDN_BASE}${hero.img}`;
    img.alt = hero.localized_name;

    const remove = document.createElement("button");
    remove.className = "slot-remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => removePick(team, index));

    slot.append(img, remove);
    return slot;
  };

  allySlots.innerHTML = "";
  enemySlots.innerHTML = "";

  for (let i = 0; i < 5; i += 1) {
    allySlots.append(createSlot(picks.ally[i], "ally", i));
    enemySlots.append(createSlot(picks.enemy[i], "enemy", i));
  }
}

function handleHeroPick(hero) {
  const team = selectedTeam;
  if (picks.ally.some((pick) => pick?.id === hero.id) ||
      picks.enemy.some((pick) => pick?.id === hero.id)) {
    return;
  }
  const slotIndex = picks[team].findIndex((slot) => !slot);
  if (slotIndex === -1) {
    alert("Все 5 слотов заняты.");
    return;
  }

  picks[team][slotIndex] = hero;
  updateTeamSlots();
}

function removePick(team, index) {
  picks[team][index] = null;
  updateTeamSlots();
}

function updateToggleButtons() {
  teamToggle.querySelectorAll(".toggle-button").forEach((button) => {
    const isActive = button.dataset.team === selectedTeam;
    button.classList.toggle("is-active", isActive);
  });
}

async function loadHeroes() {
  const cached = loadCache("heroes");
  if (cached) {
    heroes = cached;
    status.textContent = `Загружено героев: ${heroes.length} (из кэша)`;
    renderHeroes(heroes);
    return;
  }

  try {
    status.textContent = "Загружаем героев из OpenDota...";
    const response = await fetch(HEROES_URL);
    if (!response.ok) {
      throw new Error("Не удалось загрузить героев");
    }

    heroes = await response.json();
    heroes.sort((a, b) => a.localized_name.localeCompare(b.localized_name));
    saveCache("heroes", heroes);

    status.textContent = `Загружено героев: ${heroes.length}`;
    renderHeroes(heroes);
  } catch (error) {
    status.textContent = "Ошибка загрузки. Проверьте подключение и повторите.";
    console.error(error);
  }
}

async function loadMatchups(heroId) {
  const cacheKey = `matchups-${heroId}`;
  const cached = loadCache(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(`${MATCHUPS_URL}/${heroId}/matchups`);
  if (!response.ok) {
    throw new Error("Не удалось загрузить матчапы");
  }
  const data = await response.json();
  saveCache(cacheKey, data);
  return data;
}

function clearRatings() {
  grid.querySelectorAll(".hero-card").forEach((card) => {
    card.removeAttribute("data-rating");
    card.removeAttribute("data-rating-label");
  });
}

function highlightRatings(scores) {
  clearRatings();
  const topIds = scores.slice(0, 10).map((item) => item.heroId);
  const bottomIds = scores.slice(-10).map((item) => item.heroId);

  grid.querySelectorAll(".hero-card").forEach((card) => {
    const heroId = Number(card.dataset.heroId);
    if (topIds.includes(heroId)) {
      card.dataset.rating = "good";
      card.dataset.ratingLabel = "+";
    } else if (bottomIds.includes(heroId)) {
      card.dataset.rating = "bad";
      card.dataset.ratingLabel = "-";
    }
  });
}

function renderRecommendations(list) {
  recommendations.innerHTML = "";
  if (list.length === 0) {
    recommendations.innerHTML = "<p>Нет рекомендаций.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((item) => {
    const card = document.createElement("div");
    card.className = "recommendation-card";

    const hero = heroes.find((h) => h.id === item.heroId);
    if (!hero) return;

    const img = document.createElement("img");
    img.src = `${CDN_BASE}${hero.img}`;
    img.alt = hero.localized_name;

    const name = document.createElement("strong");
    name.textContent = hero.localized_name;

    const score = document.createElement("div");
    score.className = "recommendation-score";
    score.textContent = `${item.score.toFixed(1)}% винрейт`;

    const details = document.createElement("div");
    details.className = "hero-role";
    details.textContent = `Лучше всего против: ${item.bestAgainst}`;

    card.append(img, name, score, details);
    fragment.append(card);
  });
  recommendations.append(fragment);
}

async function analyzeWithOpenDota() {
  const enemyHeroes = picks.enemy.filter(Boolean);
  if (enemyHeroes.length === 0) {
    analysisStatus.textContent = "Добавьте хотя бы 1 героя в команду противника.";
    return;
  }

  analysisStatus.textContent = "Считаем контрпики через OpenDota...";

  const matchupLists = await Promise.all(
    enemyHeroes.map((hero) => loadMatchups(hero.id))
  );

  const scoreMap = new Map();
  const bestAgainstMap = new Map();

  matchupLists.forEach((matchups, index) => {
    const enemyHero = enemyHeroes[index];
    matchups.forEach((matchup) => {
      const heroId = matchup.hero_id;
      const winrate = (matchup.wins / matchup.games_played) * 100;
      if (!scoreMap.has(heroId)) {
        scoreMap.set(heroId, []);
      }
      scoreMap.get(heroId).push(winrate);

      const bestAgainst = bestAgainstMap.get(heroId);
      if (!bestAgainst || winrate > bestAgainst.winrate) {
        bestAgainstMap.set(heroId, {
          name: enemyHero.localized_name,
          winrate,
        });
      }
    });
  });

  const scoredHeroes = Array.from(scoreMap.entries())
    .filter(([heroId]) =>
      !picks.ally.some((hero) => hero?.id === heroId) &&
      !picks.enemy.some((hero) => hero?.id === heroId)
    )
    .map(([heroId, wins]) => ({
      heroId,
      score: wins.reduce((sum, value) => sum + value, 0) / wins.length,
      bestAgainst: bestAgainstMap.get(heroId)?.name ?? "неизвестно",
    }))
    .sort((a, b) => b.score - a.score);

  const top = scoredHeroes.slice(0, 10);
  renderRecommendations(top);
  highlightRatings(scoredHeroes);
  analysisStatus.textContent = "Рекомендации обновлены на основе OpenDota.";
}

async function analyzeWithStratz() {
  const apiKey = stratzKeyInput.value.trim();
  if (!apiKey) {
    return false;
  }

  const enemyHeroes = picks.enemy.filter(Boolean);
  if (enemyHeroes.length === 0) {
    analysisStatus.textContent = "Добавьте хотя бы 1 героя в команду противника.";
    return true;
  }

  const heroIds = enemyHeroes.map((hero) => hero.id);
  const query = `
    query HeroCounters($heroIds: [Int!]!) {
      heroes(ids: $heroIds) {
        id
        localizedName
        matchups {
          with {
            heroId
            winRate
          }
        }
      }
    }
  `;

  try {
    const response = await fetch("https://api.stratz.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        variables: { heroIds },
      }),
    });

    if (!response.ok) {
      throw new Error("STRATZ вернул ошибку");
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(data.errors[0]?.message ?? "STRATZ error");
    }

    analysisStatus.textContent =
      "STRATZ данные получены. Сейчас используется OpenDota логика.";
    return true;
  } catch (error) {
    console.error(error);
    analysisStatus.textContent =
      "Ошибка STRATZ. Проверьте ключ и попробуйте снова.";
    return true;
  }
}

async function handleAnalyze() {
  try {
    analysisStatus.textContent = "Запускаем анализ...";
    const usedStratz = await analyzeWithStratz();
    if (!usedStratz) {
      analysisStatus.textContent =
        "STRATZ ключ не указан, используем OpenDota.";
    }
    await analyzeWithOpenDota();
  } catch (error) {
    console.error(error);
    analysisStatus.textContent = "Ошибка анализа. Попробуйте позже.";
  }
}

teamToggle.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  selectedTeam = button.dataset.team;
  updateToggleButtons();
});

searchInput.addEventListener("input", applySearch);

analyzeButton.addEventListener("click", handleAnalyze);

updateToggleButtons();
updateTeamSlots();
loadHeroes();
