import { Network } from './network';
import { seededRandom } from './random';
import { Simulator } from './simulator';
import type { NodeId } from './types';
import type { Trace } from '../trace/events';
import { RaftNode, type RaftConfig } from '../protocols/raft/raft';
import type { RaftMessage, RaftTimer } from '../protocols/raft/messages';

export interface ScenarioConfig {
  readonly nodeIds: readonly NodeId[];
  readonly seed: number;
  readonly durationMs: number;
  readonly network: {
    readonly minDelayMs: number;
    readonly maxDelayMs: number;
    readonly dropProbability: number;
  };
  readonly raft: RaftConfig;
}

export interface ScenarioResult {
  readonly trace: Trace;
}

export function runScenario(config: ScenarioConfig): ScenarioResult {
  const random = seededRandom(config.seed);
  const network = new Network(config.network, random);

  const simulator = new Simulator({
    nodeIds: config.nodeIds,
    makeProtocol: () => new RaftNode(config.raft, random),
    describeMessage: (body) => describeRaftMessage(body as RaftMessage),
    describeTimer: (token) => (token as RaftTimer).kind,
    network,
    random,
  });

  simulator.start();
  const trace = simulator.advanceTo(config.durationMs);
  return { trace };
}

function describeRaftMessage(message: RaftMessage): string {
  switch (message.kind) {
    case 'requestVote':
      return `RequestVote t=${message.term}`;
    case 'requestVoteResponse':
      return `Vote ${message.voteGranted ? '✓' : '✗'} t=${message.term}`;
    case 'appendEntries':
      return message.entries.length === 0
        ? `Heartbeat t=${message.term}`
        : `AppendEntries t=${message.term} n=${message.entries.length}`;
    case 'appendEntriesResponse':
      return `Ack ${message.success ? '✓' : '✗'} t=${message.term}`;
    case 'clientPropose':
      return `Client ${message.source}`;
  }
}
