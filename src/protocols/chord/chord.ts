import type { Message, NodeContext, Protocol } from '../../sim/types';
import type {
  ChordMessage,
  ChordSnapshot,
  CompletedLookup,
  Lookup,
  LookupResponse,
  RingMember,
} from './messages';

export interface ChordConfig {
  readonly self: RingMember;
  readonly successor: RingMember;
  readonly predecessor: RingMember;
}

export class ChordNode implements Protocol<ChordSnapshot> {
  private readonly completed: CompletedLookup[] = [];

  private readonly config: ChordConfig;

  constructor(config: ChordConfig) {
    this.config = config;
  }

  onStart(): void {
    // Static ring — no discovery needed.
  }

  onMessage(context: NodeContext, message: Message): void {
    const body = message.body as ChordMessage;
    if (body.kind === 'lookup') this.handleLookup(context, body);
    else this.handleResponse(context, body);
  }

  onTimer(): void {
    // No timers for the static v1.
  }

  snapshot(): ChordSnapshot {
    return {
      nodeId: this.config.self.nodeId,
      position: this.config.self.position,
      successor: this.config.successor.nodeId,
      predecessor: this.config.predecessor.nodeId,
      completed: [...this.completed],
    };
  }

  private handleLookup(context: NodeContext, lookup: Lookup): void {
    const pathWithSelf = [...lookup.path, context.self];
    if (this.owns(lookup.keyPosition)) {
      const response: LookupResponse = {
        kind: 'lookupResponse',
        key: lookup.key,
        keyPosition: lookup.keyPosition,
        owner: context.self,
        path: pathWithSelf,
      };
      context.send(lookup.origin, response);
      return;
    }
    const next: Lookup = { ...lookup, path: pathWithSelf };
    context.send(this.config.successor.nodeId, next);
  }

  private handleResponse(context: NodeContext, response: LookupResponse): void {
    if (response.owner === context.self) return;
    this.completed.push({
      key: response.key,
      keyPosition: response.keyPosition,
      owner: response.owner,
      path: response.path,
      completedAt: context.now(),
    });
  }

  // Key k is owned by the first node whose position >= k, walking the ring.
  // For this node: I own k iff k is in (predecessor, self] (with wrap).
  private owns(keyPosition: number): boolean {
    const mine = this.config.self.position;
    const theirs = this.config.predecessor.position;
    if (theirs < mine) return keyPosition > theirs && keyPosition <= mine;
    return keyPosition > theirs || keyPosition <= mine;
  }
}

export function buildRing(nodeIds: readonly string[]): Map<string, ChordConfig> {
  const members = nodeIds
    .map((nodeId) => ({ nodeId, position: hashForRing(nodeId) }))
    .sort((a, b) => a.position - b.position);

  const configs = new Map<string, ChordConfig>();
  for (let index = 0; index < members.length; index += 1) {
    const self = members[index];
    const successor = members[(index + 1) % members.length];
    const predecessor = members[(index - 1 + members.length) % members.length];
    configs.set(self.nodeId, { self, successor, predecessor });
  }
  return configs;
}

function hashForRing(nodeId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < nodeId.length; i += 1) {
    hash ^= nodeId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
