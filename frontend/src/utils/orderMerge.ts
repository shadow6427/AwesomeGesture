import { Order } from '../components/OrderHistory';

export function mergeOrders(orders: Order[]): Order[] {
  const mergedMap = new Map<string, Order>();

  for (const order of orders) {
    const key = order.id || order.clientOrderId;
    if (!key) continue;

    // Try finding by id first, then clientOrderId
    let existingKey = order.id && mergedMap.has(order.id) 
      ? order.id 
      : (order.clientOrderId && mergedMap.has(order.clientOrderId) ? order.clientOrderId : null);
    
    if (!existingKey) {
      mergedMap.set(order.id || order.clientOrderId!, order);
      continue;
    }

    const existing = mergedMap.get(existingKey)!;

    const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
    const orderTime = new Date(order.updatedAt || order.createdAt).getTime();

    const newer = orderTime >= existingTime ? order : existing;
    const older = orderTime >= existingTime ? existing : order;

    const mergedOrder: Order = {
      ...older,
      ...newer,
      // Preserve stable fields from the older one if they exist
      instrumentId: older.instrumentId || newer.instrumentId,
      instrumentSymbol: older.instrumentSymbol || newer.instrumentSymbol,
      side: older.side || newer.side,
      type: older.type || newer.type,
      notes: older.notes || newer.notes,
      id: older.id || newer.id,
      clientOrderId: older.clientOrderId || newer.clientOrderId,
    };

    // Remove old key if it's different from the new one
    if (existingKey !== mergedOrder.id && existingKey !== mergedOrder.clientOrderId) {
      mergedMap.delete(existingKey);
    }
    // Also delete clientOrderId key if we just upgraded to id
    if (existingKey === existing.clientOrderId && mergedOrder.id) {
      mergedMap.delete(existing.clientOrderId!);
    }
    
    mergedMap.set(mergedOrder.id || mergedOrder.clientOrderId!, mergedOrder);
  }

  return Array.from(mergedMap.values());
}
