const MIN_FUZZY_QUERY_LENGTH = 3;

function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

function words(value) {
  return normalize(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function typoScore(query, candidate) {
  if (query.length < MIN_FUZZY_QUERY_LENGTH || candidate.length < MIN_FUZZY_QUERY_LENGTH) {
    return 0;
  }

  const maxDistance = query.length <= 5 ? 1 : 2;
  const distance = levenshtein(query, candidate);
  if (distance <= maxDistance) {
    return 420 - distance * 30;
  }
  return 0;
}

function tokenScore(query, token) {
  if (!token) return 0;
  if (token === query) return 760;
  if (token.startsWith(query)) return query.length >= 2 ? 650 : 0;
  if (query.length >= 3 && token.includes(query)) return 540;
  return typoScore(query, token);
}

export function scoreAssetSearch(asset, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return 1;

  const symbol = normalize(asset.symbol);
  const name = normalize(asset.name);
  const category = normalize(asset.type);

  if (symbol === query) return 1000;
  if (symbol.startsWith(query)) return 900;
  if (query.length >= 2 && symbol.includes(query)) return 800;

  if (name === query) return 780;
  if (name.startsWith(query)) return 700;
  if (query.length >= 3 && name.includes(query)) return 600;

  const queryTokens = words(query);
  const candidates = [symbol, ...words(name)];
  const perTokenScore = queryTokens.length > 0
    ? Math.min(...queryTokens.map(part => Math.max(...candidates.map(candidate => tokenScore(part, candidate)))))
    : 0;

  if (perTokenScore > 0) return perTokenScore;
  if (query.length >= 3 && category.includes(query)) return 200;
  return 0;
}

export function filterAndRankAssets(assets, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return [...assets];

  return assets
    .map((asset, index) => ({ asset, index, score: scoreAssetSearch(asset, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.asset);
}
