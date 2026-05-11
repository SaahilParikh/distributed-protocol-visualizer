import type { Message, NodeContext, Protocol } from '../../sim/types';
import type {
  CompletedLookup,
  FindNode,
  FindNodeResponse,
  KademliaId,
  KademliaMessage,
  KademliaSnapshot,
  Peer,
} from './messages';

export interface KademliaConfig {
  readonly self: Peer;
  readonly peers: readonly Peer[];
}

export class KademliaNode implements Protocol<KademliaSnapshot> {
  private readonly config: KademliaConfig;
  private readonly completed: CompletedLookup[] = [];

  constructor(config: KademliaConfig) {
    this.config = config;
  }

  onStart(): void {}
  onTimer(): void {}

  onMessage(context: NodeContext, message: Message): void {
    const body = message.body as KademliaMessage;
    if (body.kind === 'findNode') this.handleFindNode(context, body);
    else this.handleResponse(body);
  }

  snapshot(): KademliaSnapshot {
    return {
      nodeId: this.config.self.nodeId,
      kademliaId: this.config.self.kademliaId,
      peers: this.config.peers,
      completed: [...this.completed],
    };
  }

  private handleFindNode(context: NodeContext, lookup: FindNode): void {
    const visited = new Set([...lookup.visited, context.self]);
    const candidates: readonly Peer[] = [this.config.self, ...this.config.peers];
    const closest = closestUnvisited(candidates, lookup.keyId, visited);

    // If nobody closer to the key is unvisited, we are (transitively) the closest.
    if (closest === null) {
      const response: FindNodeResponse = {
        kind: 'findNodeResponse',
        key: lookup.key,
        keyId: lookup.keyId,
        owner: this.config.self,
        path: [...visited],
      };
      context.send(lookup.origin, response);
      return;
    }

    // Someone else is closer — forward.
    const next: FindNode = { ...lookup, visited: [...visited] };
    context.send(closest.nodeId, next);
  }

  private handleResponse(response: FindNodeResponse): void {
    this.completed.push({
      key: response.key,
      keyId: response.keyId,
      owner: response.owner,
      path: response.path,
      completedAt: 0,
    });
  }
}

function closestUnvisited(
  peers: readonly Peer[],
  target: KademliaId,
  visited: ReadonlySet<string>,
): Peer | null {
  let best: Peer | null = null;
  let bestDistance = Infinity;
  for (const peer of peers) {
    if (visited.has(peer.nodeId)) continue;
    const distance = peer.kademliaId ^ target;
    if (distance < bestDistance) {
      best = peer;
      bestDistance = distance;
    }
  }
  return best;
}

export function buildKademliaCluster(nodeIds: readonly string[]): Map<string, KademliaConfig> {
  const peers: Peer[] = nodeIds.map((nodeId) => ({ nodeId, kademliaId: kademliaIdFor(nodeId) }));
  const configs = new Map<string, KademliaConfig>();
  for (const self of peers) {
    configs.set(self.nodeId, {
      self,
      peers: peers.filter((peer) => peer.nodeId !== self.nodeId),
    });
  }
  return configs;
}

export function kademliaIdFor(name: string): KademliaId {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0xff;
}
