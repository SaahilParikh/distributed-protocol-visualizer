import { VirtualClock } from './clock';
import { Network } from './network';
import type { RandomSource } from './random';
import { EventScheduler } from './scheduler';
import type { Message, NodeContext, NodeId, Protocol } from './types';
import type { TraceEvent } from '../trace/events';
import { TraceRecorder } from '../trace/recorder';

type PendingEvent =
  | { kind: 'deliver'; message: Message; messageId: string; labelForTrace: string }
  | { kind: 'timer'; node: NodeId; token: unknown; labelForTrace: string };

export interface SimulatorConfig<State> {
  readonly nodeIds: readonly NodeId[];
  readonly makeProtocol: (nodeId: NodeId) => Protocol<State>;
  readonly describeMessage: (body: unknown) => string;
  readonly describeTimer: (token: unknown) => string;
  readonly network: Network;
  readonly random: RandomSource;
}

export class Simulator<State> {
  private readonly clock = new VirtualClock();
  private readonly scheduler = new EventScheduler<PendingEvent>();
  private readonly recorder = new TraceRecorder();
  private readonly protocols = new Map<NodeId, Protocol<State>>();
  private messageCounter = 0;

  private readonly config: SimulatorConfig<State>;

  constructor(config: SimulatorConfig<State>) {
    this.config = config;
    for (const nodeId of config.nodeIds) {
      const protocol = config.makeProtocol(nodeId);
      this.protocols.set(nodeId, protocol);
    }
  }

  start(): void {
    for (const [nodeId, protocol] of this.protocols) {
      protocol.onStart(this.contextFor(nodeId));
      this.snapshotNode(nodeId);
    }
  }

  advanceTo(until: number): readonly TraceEvent[] {
    while (true) {
      const next = this.scheduler.peek();
      if (next === null || next.deliverAt > until) break;
      this.scheduler.pop();
      this.clock.advanceTo(next.deliverAt);
      this.dispatch(next.payload);
    }
    if (until > this.clock.now()) {
      this.clock.advanceTo(until);
    }
    return this.recorder.finish();
  }

  partition(assignments: Readonly<Record<NodeId, number>>, healed = false): void {
    if (healed) {
      this.config.network.heal();
    } else {
      for (const [nodeId, groupId] of Object.entries(assignments)) {
        this.config.network.setPartition(nodeId, groupId);
      }
    }
    this.recorder.record({
      kind: 'partitionChanged',
      at: this.clock.now(),
      assignments,
      healed,
    });
  }


  now(): number {
    return this.clock.now();
  }

  events(): readonly TraceEvent[] {
    return this.recorder.finish();
  }

  submitCommand(toNode: NodeId, body: unknown): void {
    const protocol = this.protocols.get(toNode);
    if (protocol === undefined) return;
    // Bypass the network — client requests aren't peer RPCs.
    protocol.onMessage(this.contextFor(toNode), { from: toNode, to: toNode, body });
    this.snapshotNode(toNode);
  }

  setDropProbability(probability: number): void {
    this.config.network.setDropProbability(probability);
  }

  private contextFor(nodeId: NodeId): NodeContext {
    const peers = this.config.nodeIds.filter((id) => id !== nodeId);
    return {
      self: nodeId,
      peers,
      now: () => this.clock.now(),
      send: (to, body) => this.enqueueSend(nodeId, to, body),
      scheduleTimer: (at, token) => this.enqueueTimer(nodeId, at, token),
    };
  }

  private enqueueSend(from: NodeId, to: NodeId, body: unknown): void {
    const now = this.clock.now();
    const message: Message = { from, to, body };
    const messageId = `m${this.messageCounter++}`;
    const label = this.config.describeMessage(body);
    const decision = this.config.network.decideDelivery(message, now);

    this.recorder.record({
      kind: 'messageSent',
      at: now,
      messageId,
      from,
      to,
      label,
      body,
      willDeliverAt: decision.kind === 'deliver' ? decision.deliverAt : null,
    });

    if (decision.kind === 'drop') {
      this.recorder.record({
        kind: 'messageDropped',
        at: now,
        messageId,
        reason: 'random',
      });
      return;
    }

    this.scheduler.schedule(decision.deliverAt, {
      kind: 'deliver',
      message,
      messageId,
      labelForTrace: label,
    });
  }

  private enqueueTimer(nodeId: NodeId, at: number, token: unknown): void {
    this.scheduler.schedule(at, {
      kind: 'timer',
      node: nodeId,
      token,
      labelForTrace: this.config.describeTimer(token),
    });
  }

  private dispatch(event: PendingEvent): void {
    if (event.kind === 'deliver') {
      this.recorder.record({
        kind: 'messageDelivered',
        at: this.clock.now(),
        messageId: event.messageId,
      });
      const destination = this.protocols.get(event.message.to);
      if (destination !== undefined) {
        destination.onMessage(this.contextFor(event.message.to), event.message);
        this.snapshotNode(event.message.to);
      }
      return;
    }
    const protocol = this.protocols.get(event.node);
    if (protocol === undefined) return;
    this.recorder.record({
      kind: 'timerFired',
      at: this.clock.now(),
      node: event.node,
      label: event.labelForTrace,
    });
    protocol.onTimer(this.contextFor(event.node), event.token);
    this.snapshotNode(event.node);
  }

  private snapshotNode(nodeId: NodeId): void {
    const protocol = this.protocols.get(nodeId);
    if (protocol === undefined) return;
    this.recorder.record({
      kind: 'nodeStateChanged',
      at: this.clock.now(),
      node: nodeId,
      snapshot: protocol.snapshot(),
    });
  }
}
