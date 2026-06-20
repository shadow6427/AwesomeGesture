import type { Asset } from './AssetSelector';

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const searchTokens = (value: string): string[] =>
  normalizeSearchText(value).split(/\s+/).filter(Boolean);

const damerauLevenshteinDistance = (left: string, right: string): number => {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const distance = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) distance[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) distance[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        distance[i][j] = Math.min(distance[i][j], distance[i - 2][j - 2] + 1);
      }
    }
  }

  return distance[left.length][right.length];
};

const trigrams = (value: string): Set<string> => {
  const padded = `  ${value}  `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
};

const trigramSimilarity = (left: string, right: string): number => {
  if (left.length < 3 || right.length < 3) return 0;
  const leftGrams = trigrams(left);
  const rightGrams = trigrams(right);
  let intersection = 0;
  leftGrams.forEach(gram => {
    if (rightGrams.has(gram)) intersection += 1;
  });
  return (2 * intersection) / (leftGrams.size + rightGrams.size);
};

const typoScore = (query: string, candidate: string): number => {
  if (query.length < 4 || candidate.length < 4) return 0;
  const distance = damerauLevenshteinDistance(query, candidate);
  const allowedDistance = query.length >= 7 && candidate.length >= 7 ? 2 : 1;
  if (distance <= allowedDistance) return 12 - distance;
  const similarity = trigramSimilarity(query, candidate);
  return similarity >= 0.58 ? Math.round(similarity * 10) : 0;
};

export const scoreAssetSearch = (asset: Asset, rawQuery: string): number => {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 1;

  const symbol = normalizeSearchText(asset.symbol).replace(/\s+/g, '');
  const name = normalizeSearchText(asset.name);
  const category = normalizeSearchText(asset.type);
  const tokens = searchTokens(asset.name);

  if (symbol === query) return 100;
  if (symbol.startsWith(query)) return 80;
  if (symbol.includes(query) && query.length >= 2) return 60;
  if (name.startsWith(query)) return 45;
  if (name.includes(query) && query.length >= 3) return 35;

  if (query.length >= 3 && tokens.some(token => token.startsWith(query))) return 30;
  if (query.length >= 4 && tokens.some(token => token.includes(query))) return 24;
  if (category === query) return 18;

  const candidates = [symbol, ...tokens];
  const bestTypoScore = Math.max(...candidates.map(candidate => typoScore(query, candidate)));
  return bestTypoScore;
};
