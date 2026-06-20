import { Order } from '../components/OrderHistory';
import { mergeOrders } from './orderMerge';

// Helper to create a partial order for testing
function createOrder(overrides: Partial<Order>): Order {
  return {
    id: '1',
    clientOrderId: 'c1',
    instrumentId: 'BTC-USD',
    instrumentSymbol: 'BTC/USD',
    side: 'buy',
    type: 'limit',
    status: 'new',
    price: 50000,
    stopPrice: null,
    quantity: 1,
    filledQuantity: 0,
    remainingQuantity: 1,
    avgFillPrice: null,
    filledValue: null,
    fees: null,
    feeCurrency: 'USD',
    timeInForce: 'GTC',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    expiredAt: null,
    notes: 'Initial note',
    ...overrides,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 1. API before WebSocket
function testApiBeforeWs() {
  const apiOrder = createOrder({ id: '1', clientOrderId: 'c1', status: 'new', updatedAt: '2023-01-01T00:00:00Z' });
  const wsOrder = createOrder({ id: '1', clientOrderId: 'c1', status: 'filled', filledQuantity: 1, updatedAt: '2023-01-01T00:00:05Z' });

  const merged = mergeOrders([apiOrder, wsOrder]);
  assert(merged.length === 1, 'Should deduplicate API and WS orders');
  assert(merged[0].status === 'filled', 'Should use newest status (WS)');
  assert(merged[0].filledQuantity === 1, 'Should use newest filledQuantity (WS)');
}

// 2. WebSocket before API
function testWsBeforeApi() {
  const wsOrder = createOrder({ id: '1', clientOrderId: 'c1', status: 'pending', updatedAt: '2023-01-01T00:00:02Z' });
  // The API response might still have the old data because it was queried earlier but arrived later
  const apiOrder = createOrder({ id: '1', clientOrderId: 'c1', status: 'new', updatedAt: '2023-01-01T00:00:00Z', notes: 'API note' });

  const merged = mergeOrders([wsOrder, apiOrder]); // Order in array mimics arrival/concatenation
  assert(merged.length === 1, 'Should deduplicate WS and API orders');
  assert(merged[0].status === 'pending', 'Should prefer newest status (WS) even if API arrives later');
  assert(merged[0].notes === 'API note', 'Should preserve stable metadata like notes from older API order if omitted or different in WS');
}

// 3. Status change updates
function testStatusChangeUpdates() {
  const wsUpdate1 = createOrder({ id: '1', clientOrderId: 'c1', status: 'partially_filled', filledQuantity: 0.5, updatedAt: '2023-01-01T00:00:03Z' });
  const wsUpdate2 = createOrder({ id: '1', clientOrderId: 'c1', status: 'filled', filledQuantity: 1, updatedAt: '2023-01-01T00:00:06Z' });

  const merged = mergeOrders([wsUpdate1, wsUpdate2]);
  assert(merged.length === 1, 'Should deduplicate multiple WS updates');
  assert(merged[0].status === 'filled', 'Should use the latest status');
  assert(merged[0].filledQuantity === 1, 'Should use the latest filled quantity');
}

// 4. Identity upgrade (clientOrderId to id)
function testIdentityUpgrade() {
  const wsOrder = createOrder({ id: '', clientOrderId: 'c1', status: 'new', updatedAt: '2023-01-01T00:00:01Z' });
  const apiOrder = createOrder({ id: 'server-id-1', clientOrderId: 'c1', status: 'new', updatedAt: '2023-01-01T00:00:02Z' });

  const merged = mergeOrders([wsOrder, apiOrder]);
  assert(merged.length === 1, 'Should deduplicate by upgrading identity');
  assert(merged[0].id === 'server-id-1', 'Should adopt server ID');
  assert(merged[0].clientOrderId === 'c1', 'Should keep clientOrderId');
}

function runTests() {
  console.log('Running OrderMerge tests...');
  testApiBeforeWs();
  testWsBeforeApi();
  testStatusChangeUpdates();
  testIdentityUpgrade();
  console.log('All tests passed!');
}

runTests();
