import type { RandomSource } from './random';
import type { Message, NodeId } from './types';

export interface NetworkConfig {
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  readonly dropProbability: number;
}

export type DeliveryDecision =
  | { kind: 'deliver'; deliverAt: number }
  | { kind: 'drop' };

// Drops, delays, and partitions messages. Drop/delay roll the injected
// RNG so a fixed seed replays identically.
export class Network {
  private readonly partitionOf = new Map<NodeId, number>();
  private readonly config: NetworkConfig;
  private readonly random: RandomSource;

  private dropProbability: number;

  constructor(config: NetworkConfig, random: RandomSource) {
    this.config = config;
    this.random = random;
    this.dropProbability = config.dropProbability;
  }

  setDropProbability(probability: number): void {
    this.dropProbability = Math.max(0, Math.min(1, probability));
  }

  setPartition(nodeId: NodeId, partitionId: number): void {
    this.partitionOf.set(nodeId, partitionId);
  }

  heal(): void {
    this.partitionOf.clear();
  }

  decideDelivery(message: Message, sentAt: number): DeliveryDecision {
    if (!this.canReach(message.from, message.to)) {
      return { kind: 'drop' };
    }
    if (this.random.chance(this.dropProbability)) {
      return { kind: 'drop' };
    }
    const delay = this.random.nextInt(this.config.minDelayMs, this.config.maxDelayMs);
    return { kind: 'deliver', deliverAt: sentAt + delay };
  }

  private canReach(from: NodeId, to: NodeId): boolean {
    const fromPartition = this.partitionOf.get(from);
    const toPartition = this.partitionOf.get(to);
    if (fromPartition === undefined || toPartition === undefined) return true;
    return fromPartition === toPartition;
  }
}
