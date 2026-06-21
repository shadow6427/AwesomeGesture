import type { Asset } from './AssetSelector';
import { scoreAssetSearch } from './assetSearch';

const assets: Asset[] = [
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { id: 'bch', symbol: 'BCH', name: 'Bitcoin Cash', type: 'crypto' },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { id: 'aapl', symbol: 'AAPL', name: 'Apple Inc', type: 'stock' },
  { id: 'gold', symbol: 'XAU', name: 'Gold Spot', type: 'commodity' },
];

const ranked = (query: string): Asset[] =>
  assets
    .map((asset, index) => ({ asset, index, score: scoreAssetSearch(asset, query) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.asset);

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(ranked('BTC')[0]?.id === 'btc', 'exact symbol match should rank first');
assert(ranked('BT')[0]?.id === 'btc', 'symbol prefix match should rank first');
assert(ranked('Bitocin')[0]?.id === 'btc', 'one-edit typo should find Bitcoin');
assert(ranked('Cash')[0]?.id === 'bch', 'partial word query should find Bitcoin Cash');
assert(ranked('bi')[0]?.id === 'btc', 'short symbol prefix should still work');
assert(ranked('it').length === 0, 'short non-prefix query should not create broad noisy matches');

console.log('asset selector search validation passed');
