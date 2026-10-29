import { DELIVERY_QUEUES, notifyDeliveryWork } from "./delivery-work-notifications.js";

export type NativePendingEffectScope = { companyId: string; runId?: string };

export async function notifyNativePendingEffects(transaction: object, scope: NativePendingEffectScope) {
  await notifyDeliveryWork(transaction, DELIVERY_QUEUES.nativePendingEffects,
    JSON.stringify({ companyId: scope.companyId, runId: scope.runId }));
}
