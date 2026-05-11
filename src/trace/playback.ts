import type { NodeId } from '../sim/types';
import type { MessageSent, Trace } from './events';

export interface InFlightMessage {
  readonly messageId: string;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly label: string;
  readonly sentAt: number;
  readonly deliverAt: number;
  readonly progress: number;
}

export interface WorldFrame<Snapshot> {
  readonly time: number;
  readonly nodeSnapshots: ReadonlyMap<NodeId, Snapshot>;
  readonly inFlight: readonly InFlightMessage[];
}

export function worldAt<Snapshot>(trace: Trace, time: number): WorldFrame<Snapshot> {
  const nodeSnapshots = new Map<NodeId, Snapshot>();
  const inFlightById = new Map<string, MessageSent>();

  for (const event of trace) {
    if (event.at > time) break;
    switch (event.kind) {
      case 'nodeStateChanged':
        nodeSnapshots.set(event.node, event.snapshot as Snapshot);
        break;
      case 'messageSent':
        if (event.willDeliverAt !== null && event.willDeliverAt > time) {
          inFlightById.set(event.messageId, event);
        }
        break;
      case 'messageDelivered':
      case 'messageDropped':
        inFlightById.delete(event.messageId);
        break;
    }
  }

  const inFlight: InFlightMessage[] = [];
  for (const sent of inFlightById.values()) {
    if (sent.willDeliverAt === null) continue;
    const total = sent.willDeliverAt - sent.at;
    const progress = total > 0 ? Math.min(1, Math.max(0, (time - sent.at) / total)) : 1;
    inFlight.push({
      messageId: sent.messageId,
      from: sent.from,
      to: sent.to,
      label: sent.label,
      sentAt: sent.at,
      deliverAt: sent.willDeliverAt,
      progress,
    });
  }

  return { time, nodeSnapshots, inFlight };
}

export function traceDuration(trace: Trace): number {
  if (trace.length === 0) return 0;
  let max = 0;
  for (const event of trace) {
    if (event.at > max) max = event.at;
    if (event.kind === 'messageSent' && event.willDeliverAt !== null && event.willDeliverAt > max) {
      max = event.willDeliverAt;
    }
  }
  return max;
}
