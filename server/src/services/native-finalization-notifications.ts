import { notifyNativeResponsePresentation } from "./native-response-presentation-notifications.js";
import { DELIVERY_QUEUES, notifyDeliveryWork } from "./delivery-work-notifications.js";

export type NativeFinalizationWorkScope = { companyId: string; runId?: string; issueId?: string };

export async function notifyNativeFinalizationWork(transaction: object, scope: NativeFinalizationWorkScope) {
  if (scope.issueId || scope.runId) await notifyNativeResponsePresentation(transaction, scope);
  await notifyDeliveryWork(transaction, DELIVERY_QUEUES.nativePendingEffects,
    JSON.stringify({ companyId: scope.companyId, runId: scope.runId }));
}
