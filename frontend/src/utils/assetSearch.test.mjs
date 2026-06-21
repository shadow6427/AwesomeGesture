import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAndRankAssets, scoreAssetSearch } from './assetSearch.mjs';

const assets = [
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { id: 'btcg', symbol: 'BTCG', name: 'Bitcoin Growth', type: 'etf' },
  { id: 'gold', symbol: 'GLD', name: 'Gold Trust', type: 'commodity' },
  { id: 'coin', symbol: 'COIN', name: 'Coinbase Global', type: 'stock' },
];

test('exact symbol match outranks prefixes and name matches', () => {
  assert.equal(filterAndRankAssets(assets, 'BTC')[0].id, 'btc');
  assert.ok(scoreAssetSearch(assets[1], 'BTC') > scoreAssetSearch(assets[2], 'BTC'));
});

test('symbol prefix priority is preserved', () => {
  const ranked = filterAndRankAssets(assets, 'BTCG');
  assert.equal(ranked[0].id, 'btcg');
});

test('one-edit typo in asset name still finds the intended asset', () => {
  const ranked = filterAndRankAssets(assets, 'Bitocin');
  assert.equal(ranked[0].id, 'btc');
});

test('partial word queries match asset names', () => {
  const ranked = filterAndRankAssets(assets, 'coin glo');
  assert.equal(ranked[0].id, 'coin');
});

test('short queries avoid noisy typo matches', () => {
  assert.equal(filterAndRankAssets(assets, 'bt').some(asset => asset.id === 'eth'), false);
  assert.equal(filterAndRankAssets(assets, 'zz').length, 0);
});
