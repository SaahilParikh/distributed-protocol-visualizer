import type { NodeId } from '../../sim/types';

export interface Lookup {
  readonly kind: 'lookup';
  readonly key: string;
  readonly keyPosition: number;
  readonly origin: NodeId;
  readonly path: readonly NodeId[];
}

export interface LookupResponse {
  readonly kind: 'lookupResponse';
  readonly key: string;
  readonly keyPosition: number;
  readonly owner: NodeId;
  readonly path: readonly NodeId[];
}

export type ChordMessage = Lookup | LookupResponse;

export interface CompletedLookup {
  readonly key: string;
  readonly keyPosition: number;
  readonly owner: NodeId;
  readonly path: readonly NodeId[];
  readonly completedAt: number;
}

export interface ChordSnapshot {
  readonly nodeId: NodeId;
  readonly position: number;
  readonly successor: NodeId;
  readonly predecessor: NodeId;
  readonly completed: readonly CompletedLookup[];
}

export interface RingMember {
  readonly nodeId: NodeId;
  readonly position: number;
}
