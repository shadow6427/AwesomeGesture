export interface MergeableOrder {
  id: string;
  clientOrderId?: string;
  instrumentId: string;
  instrumentSymbol: string;
  side: string;
  type: string;
  status: string;
  price: number | null;
  stopPrice: number | null;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice: number | null;
  filledValue: number | null;
  fees: number | null;
  feeCurrency: string;
  timeInForce: string;
  createdAt: string;
  updatedAt: string;
  expiredAt: string | null;
  notes?: string;
}

const DYNAMIC_FIELDS = [
  'status',
  'price',
  'stopPrice',
  'quantity',
  'filledQuantity',
  'remainingQuantity',
  'avgFillPrice',
  'filledValue',
  'fees',
  'feeCurrency',
  'timeInForce',
  'updatedAt',
  'expiredAt',
] as const;

function orderTimestamp(order: Pick<MergeableOrder, 'updatedAt' | 'createdAt'>): number {
  const updatedAt = Date.parse(order.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;

  const createdAt = Date.parse(order.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function isIncomingNewer(existing: MergeableOrder, incoming: MergeableOrder): boolean {
  const incomingTime = orderTimestamp(incoming);
  const existingTime = orderTimestamp(existing);

  if (incomingTime !== existingTime) {
    return incomingTime > existingTime;
  }

  return incoming.createdAt >= existing.createdAt;
}

function mergeOrder(existing: MergeableOrder, incoming: MergeableOrder): MergeableOrder {
  const dynamicSource = isIncomingNewer(existing, incoming) ? incoming : existing;
  const merged: MergeableOrder = {
    ...dynamicSource,
    id: existing.id || incoming.id,
    clientOrderId: existing.clientOrderId ?? incoming.clientOrderId,
    instrumentId: existing.instrumentId || incoming.instrumentId,
    instrumentSymbol: existing.instrumentSymbol || incoming.instrumentSymbol,
    side: existing.side || incoming.side,
    type: existing.type || incoming.type,
    notes: existing.notes ?? incoming.notes,
    createdAt: existing.createdAt <= incoming.createdAt ? existing.createdAt : incoming.createdAt,
  };

  for (const field of DYNAMIC_FIELDS) {
    merged[field] = dynamicSource[field] as never;
  }

  return merged;
}

function orderIdentity(order: MergeableOrder, byId: Map<string, number>, byClientOrderId: Map<string, number>): number | undefined {
  const byOrderId = byId.get(order.id);
  if (byOrderId !== undefined) {
    return byOrderId;
  }

  if (!order.clientOrderId) {
    return undefined;
  }

  return byClientOrderId.get(order.clientOrderId);
}

export function mergeOrderUpdates<T extends MergeableOrder>(orders: readonly T[]): T[] {
  const merged: MergeableOrder[] = [];
  const byId = new Map<string, number>();
  const byClientOrderId = new Map<string, number>();

  for (const order of orders) {
    const existingIndex = orderIdentity(order, byId, byClientOrderId);

    if (existingIndex === undefined) {
      const nextIndex = merged.length;
      merged.push({ ...order });
      byId.set(order.id, nextIndex);
      if (order.clientOrderId) {
        byClientOrderId.set(order.clientOrderId, nextIndex);
      }
      continue;
    }

    const nextOrder = mergeOrder(merged[existingIndex], order);
    merged[existingIndex] = nextOrder;
    byId.set(nextOrder.id, existingIndex);
    if (nextOrder.clientOrderId) {
      byClientOrderId.set(nextOrder.clientOrderId, existingIndex);
    }
    if (order.id) {
      byId.set(order.id, existingIndex);
    }
  }

  return merged as T[];
}
