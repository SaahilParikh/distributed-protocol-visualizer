import type { NodeId } from '../sim/types';

// Every simulator side-effect is appended here. The UI renders any
// virtual time by walking the list — no second simulation pass needed.
export type TraceEvent =
  | MessageSent
  | MessageDelivered
  | MessageDropped
  | NodeStateChanged
  | TimerFired
  | PartitionChanged;

export interface MessageSent {
  readonly kind: 'messageSent';
  readonly at: number;
  readonly messageId: string;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly label: string;
  readonly body: unknown;
  readonly willDeliverAt: number | null;
}

export interface MessageDelivered {
  readonly kind: 'messageDelivered';
  readonly at: number;
  readonly messageId: string;
}

export interface MessageDropped {
  readonly kind: 'messageDropped';
  readonly at: number;
  readonly messageId: string;
  readonly reason: 'partition' | 'random';
}

export interface NodeStateChanged {
  readonly kind: 'nodeStateChanged';
  readonly at: number;
  readonly node: NodeId;
  readonly snapshot: unknown;
}

export interface TimerFired {
  readonly kind: 'timerFired';
  readonly at: number;
  readonly node: NodeId;
  readonly label: string;
}

export interface PartitionChanged {
  readonly kind: 'partitionChanged';
  readonly at: number;
  readonly assignments: Readonly<Record<NodeId, number>>;
  readonly healed: boolean;
}

export type Trace = readonly TraceEvent[];
