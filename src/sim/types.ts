// The only surface the simulator sees a protocol through. New protocols
// plug in by implementing Protocol and nothing else.

export type NodeId = string;

export interface Message<Body = unknown> {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly body: Body;
}

export interface NodeContext {
  readonly self: NodeId;
  readonly peers: readonly NodeId[];
  now(): number;
  send(to: NodeId, body: unknown): void;
  /** Schedule a local wakeup at `at` (absolute virtual time). */
  scheduleTimer(at: number, token: unknown): void;
}

export interface Protocol<State> {
  onStart(context: NodeContext): void;
  onMessage(context: NodeContext, message: Message): void;
  onTimer(context: NodeContext, token: unknown): void;
  snapshot(): State;
}
