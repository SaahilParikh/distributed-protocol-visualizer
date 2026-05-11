import type { NodeId } from '../../sim/types';

export type KademliaId = number;

export interface Peer {
  readonly nodeId: NodeId;
  readonly kademliaId: KademliaId;
}

export interface FindNode {
  readonly kind: 'findNode';
  readonly key: string;
  readonly keyId: KademliaId;
  readonly origin: NodeId;
  readonly visited: readonly NodeId[];
}

export interface FindNodeResponse {
  readonly kind: 'findNodeResponse';
  readonly key: string;
  readonly keyId: KademliaId;
  readonly owner: Peer;
  readonly path: readonly NodeId[];
}

export type KademliaMessage = FindNode | FindNodeResponse;

export interface CompletedLookup {
  readonly key: string;
  readonly keyId: KademliaId;
  readonly owner: Peer;
  readonly path: readonly NodeId[];
  readonly completedAt: number;
}

export interface KademliaSnapshot {
  readonly nodeId: NodeId;
  readonly kademliaId: KademliaId;
  readonly peers: readonly Peer[];
  readonly completed: readonly CompletedLookup[];
}
