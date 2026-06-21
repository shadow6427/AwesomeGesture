import assert from 'node:assert/strict';
import { mergeOrderUpdates } from './.tmp-order-history-test/orderMerge.js';

function order(overrides = {}) {
  return {
    id: 'api-1',
    clientOrderId: 'client-1',
    instrumentId: 'BTC-USD',
    instrumentSymbol: 'BTC',
    side: 'buy',
    type: 'limit',
    status: 'new',
    price: 65000,
    stopPrice: null,
    quantity: 1,
    filledQuantity: 0,
    remainingQuantity: 1,
    avgFillPrice: null,
    filledValue: null,
    fees: null,
    feeCurrency: 'USD',
    timeInForce: 'GTC',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    expiredAt: null,
    notes: 'operator note',
    ...overrides,
  };
}

{
  const apiSnapshot = order({
    id: 'api-1',
    updatedAt: '2026-06-20T10:00:00.000Z',
    status: 'new',
    filledQuantity: 0,
    remainingQuantity: 1,
  });
  const websocketUpdate = order({
    id: 'ws-transient-1',
    clientOrderId: 'client-1',
    updatedAt: '2026-06-20T10:00:05.000Z',
    status: 'partially_filled',
    filledQuantity: 0.4,
    remainingQuantity: 0.6,
    avgFillPrice: 65010,
    filledValue: 26004,
  });

  const merged = mergeOrderUpdates([apiSnapshot, websocketUpdate]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'api-1');
  assert.equal(merged[0].clientOrderId, 'client-1');
  assert.equal(merged[0].status, 'partially_filled');
  assert.equal(merged[0].filledQuantity, 0.4);
  assert.equal(merged[0].remainingQuantity, 0.6);
  assert.equal(merged[0].instrumentId, 'BTC-USD');
  assert.equal(merged[0].side, 'buy');
  assert.equal(merged[0].type, 'limit');
  assert.equal(merged[0].notes, 'operator note');
}

{
  const websocketUpdate = order({
    id: 'ws-transient-2',
    clientOrderId: 'client-2',
    updatedAt: '2026-06-20T10:00:05.000Z',
    status: 'filled',
    filledQuantity: 2,
    remainingQuantity: 0,
    avgFillPrice: 65050,
  });
  const apiSnapshot = order({
    id: 'api-2',
    clientOrderId: 'client-2',
    updatedAt: '2026-06-20T10:00:00.000Z',
    status: 'new',
    quantity: 2,
    filledQuantity: 0,
    remainingQuantity: 2,
  });

  const merged = mergeOrderUpdates([websocketUpdate, apiSnapshot]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'ws-transient-2');
  assert.equal(merged[0].status, 'filled');
  assert.equal(merged[0].filledQuantity, 2);
  assert.equal(merged[0].remainingQuantity, 0);
  assert.equal(merged[0].instrumentSymbol, 'BTC');
}

{
  const snapshot = order({
    id: 'api-3',
    clientOrderId: 'client-3',
    updatedAt: '2026-06-20T10:00:00.000Z',
    status: 'partially_filled',
    filledQuantity: 0.5,
    remainingQuantity: 0.5,
  });
  const statusChange = order({
    id: 'api-3',
    clientOrderId: 'client-3',
    updatedAt: '2026-06-20T10:00:10.000Z',
    status: 'cancelled',
    filledQuantity: 0.5,
    remainingQuantity: 0.5,
  });
  const unrelated = order({
    id: 'api-4',
    clientOrderId: 'client-4',
    instrumentId: 'ETH-USD',
    instrumentSymbol: 'ETH',
    updatedAt: '2026-06-20T10:00:01.000Z',
  });

  const merged = mergeOrderUpdates([snapshot, statusChange, unrelated]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'api-3');
  assert.equal(merged[0].status, 'cancelled');
  assert.equal(merged[1].id, 'api-4');
}

{
  const shortIdOnlyOrders = [
    order({ id: 'a', clientOrderId: undefined, instrumentId: 'A', instrumentSymbol: 'AAA' }),
    order({ id: 'b', clientOrderId: undefined, instrumentId: 'B', instrumentSymbol: 'BBB' }),
  ];

  const merged = mergeOrderUpdates(shortIdOnlyOrders);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'a');
  assert.equal(merged[1].id, 'b');
}

console.log('order history merge tests passed');
