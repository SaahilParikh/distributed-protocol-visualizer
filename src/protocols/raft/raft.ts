import type { RandomSource } from '../../sim/random';
import type { Message, NodeContext, NodeId, Protocol } from '../../sim/types';
import type {
  AppendEntries,
  AppendEntriesResponse,
  ClientPropose,
  LogEntry,
  RaftMessage,
  RaftRole,
  RaftSnapshot,
  RaftTimer,
  RequestVote,
  RequestVoteResponse,
} from './messages';

export interface RaftConfig {
  readonly electionTimeoutMinMs: number;
  readonly electionTimeoutMaxMs: number;
  readonly heartbeatIntervalMs: number;
}

export class RaftNode implements Protocol<RaftSnapshot> {
  private role: RaftRole = 'follower';
  private currentTerm = 0;
  private votedFor: NodeId | null = null;
  private leaderId: NodeId | null = null;
  private readonly log: LogEntry[] = [];
  private commitIndex = -1;

  private readonly votesReceived = new Set<NodeId>();
  private readonly nextIndex = new Map<NodeId, number>();
  private readonly matchIndex = new Map<NodeId, number>();

  private electionDeadline = 0;
  private nextHeartbeatAt = 0;

  private readonly config: RaftConfig;
  private readonly random: RandomSource;

  constructor(config: RaftConfig, random: RandomSource) {
    this.config = config;
    this.random = random;
  }

  onStart(context: NodeContext): void {
    this.resetElectionTimer(context);
  }

  onMessage(context: NodeContext, message: Message): void {
    const body = message.body as RaftMessage;
    if (this.observedHigherTerm(body.term)) {
      this.stepDownToFollower(body.term);
    }
    switch (body.kind) {
      case 'requestVote':
        return this.handleRequestVote(context, body);
      case 'requestVoteResponse':
        return this.handleRequestVoteResponse(context, body);
      case 'appendEntries':
        return this.handleAppendEntries(context, body);
      case 'appendEntriesResponse':
        return this.handleAppendEntriesResponse(context, body);
      case 'clientPropose':
        return this.handleClientPropose(context, body);
    }
  }

  onTimer(context: NodeContext, token: unknown): void {
    const timer = token as RaftTimer;
    if (timer.kind === 'election') {
      if (context.now() >= this.electionDeadline && this.role !== 'leader') {
        this.startElection(context);
      }
      return;
    }
    if (this.role === 'leader' && context.now() >= this.nextHeartbeatAt) {
      this.broadcastHeartbeats(context);
    }
  }

  snapshot(): RaftSnapshot {
    return {
      role: this.role,
      currentTerm: this.currentTerm,
      votedFor: this.votedFor,
      log: [...this.log],
      commitIndex: this.commitIndex,
      leaderId: this.leaderId,
    };
  }

  // --- elections -------------------------------------------------------

  private startElection(context: NodeContext): void {
    this.currentTerm += 1;
    this.role = 'candidate';
    this.votedFor = context.self;
    this.leaderId = null;
    this.votesReceived.clear();
    this.votesReceived.add(context.self);
    this.resetElectionTimer(context);

    for (const peer of context.peers) {
      const body: RequestVote = {
        kind: 'requestVote',
        term: this.currentTerm,
        candidateId: context.self,
        lastLogIndex: this.lastLogIndex(),
        lastLogTerm: this.lastLogTerm(),
      };
      context.send(peer, body);
    }
  }

  private handleRequestVote(context: NodeContext, request: RequestVote): void {
    const voteGranted = this.shouldGrantVote(request);
    if (voteGranted) {
      this.votedFor = request.candidateId;
      this.resetElectionTimer(context);
    }
    const response: RequestVoteResponse = {
      kind: 'requestVoteResponse',
      term: this.currentTerm,
      voteGranted,
      voter: context.self,
    };
    context.send(request.candidateId, response);
  }

  private shouldGrantVote(request: RequestVote): boolean {
    if (request.term < this.currentTerm) return false;
    const alreadyVoted = this.votedFor !== null && this.votedFor !== request.candidateId;
    if (alreadyVoted) return false;
    return this.candidateLogIsAtLeastAsCurrent(request.lastLogTerm, request.lastLogIndex);
  }

  private candidateLogIsAtLeastAsCurrent(
    candidateLastTerm: number,
    candidateLastIndex: number,
  ): boolean {
    const ourLastTerm = this.lastLogTerm();
    if (candidateLastTerm !== ourLastTerm) return candidateLastTerm > ourLastTerm;
    return candidateLastIndex >= this.lastLogIndex();
  }

  private handleRequestVoteResponse(
    context: NodeContext,
    response: RequestVoteResponse,
  ): void {
    if (this.role !== 'candidate' || response.term !== this.currentTerm) return;
    if (!response.voteGranted) return;
    this.votesReceived.add(response.voter);
    if (this.hasMajority(context)) {
      this.becomeLeader(context);
    }
  }

  private becomeLeader(context: NodeContext): void {
    this.role = 'leader';
    this.leaderId = context.self;
    for (const peer of context.peers) {
      this.nextIndex.set(peer, this.log.length);
      this.matchIndex.set(peer, -1);
    }
    this.broadcastHeartbeats(context);
  }

  // --- log replication -------------------------------------------------

  private broadcastHeartbeats(context: NodeContext): void {
    for (const peer of context.peers) {
      this.sendAppendEntriesTo(context, peer);
    }
    this.nextHeartbeatAt = context.now() + this.config.heartbeatIntervalMs;
    context.scheduleTimer(this.nextHeartbeatAt, { kind: 'heartbeat' });
  }

  private sendAppendEntriesTo(context: NodeContext, peer: NodeId): void {
    const next = this.nextIndex.get(peer) ?? this.log.length;
    const prevLogIndex = next - 1;
    const prevLogTerm = prevLogIndex >= 0 ? this.log[prevLogIndex].term : 0;
    const entries = this.log.slice(next);
    const message: AppendEntries = {
      kind: 'appendEntries',
      term: this.currentTerm,
      leaderId: context.self,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommit: this.commitIndex,
    };
    context.send(peer, message);
  }

  private handleAppendEntries(context: NodeContext, request: AppendEntries): void {
    const success = this.canAcceptAppendEntries(request);
    if (request.term >= this.currentTerm) {
      this.role = 'follower';
      this.leaderId = request.leaderId;
      this.resetElectionTimer(context);
    }
    if (success) {
      this.applyAppendedEntries(request);
    }
    const response: AppendEntriesResponse = {
      kind: 'appendEntriesResponse',
      term: this.currentTerm,
      success,
      follower: context.self,
      matchIndex: success ? request.prevLogIndex + request.entries.length : -1,
    };
    context.send(request.leaderId, response);
  }

  private canAcceptAppendEntries(request: AppendEntries): boolean {
    if (request.term < this.currentTerm) return false;
    if (request.prevLogIndex === -1) return true;
    const entry = this.log[request.prevLogIndex];
    return entry !== undefined && entry.term === request.prevLogTerm;
  }

  private applyAppendedEntries(request: AppendEntries): void {
    this.log.length = request.prevLogIndex + 1;
    this.log.push(...request.entries);
    if (request.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(request.leaderCommit, this.log.length - 1);
    }
  }

  private handleAppendEntriesResponse(
    context: NodeContext,
    response: AppendEntriesResponse,
  ): void {
    if (this.role !== 'leader' || response.term !== this.currentTerm) return;
    if (response.success) {
      this.nextIndex.set(response.follower, response.matchIndex + 1);
      this.matchIndex.set(response.follower, response.matchIndex);
      this.advanceCommitIndex(context);
    } else {
      const current = this.nextIndex.get(response.follower) ?? 0;
      this.nextIndex.set(response.follower, Math.max(0, current - 1));
      this.sendAppendEntriesTo(context, response.follower);
    }
  }

  private advanceCommitIndex(context: NodeContext): void {
    for (let index = this.log.length - 1; index > this.commitIndex; index -= 1) {
      if (this.log[index].term !== this.currentTerm) continue;
      if (this.replicationCountAt(index, context) >= this.majoritySize(context)) {
        this.commitIndex = index;
        return;
      }
    }
  }

  private replicationCountAt(index: number, context: NodeContext): number {
    let count = 1;
    for (const peer of context.peers) {
      if ((this.matchIndex.get(peer) ?? -1) >= index) count += 1;
    }
    return count;
  }


  private handleClientPropose(context: NodeContext, request: ClientPropose): void {
    if (this.role !== 'leader') return;
    this.log.push({ term: this.currentTerm, command: request.command, source: request.source });
    for (const peer of context.peers) this.sendAppendEntriesTo(context, peer);
  }

  // --- term handling ---------------------------------------------------

  private observedHigherTerm(incomingTerm: number): boolean {
    return incomingTerm > this.currentTerm;
  }

  private stepDownToFollower(newTerm: number): void {
    this.currentTerm = newTerm;
    this.role = 'follower';
    this.votedFor = null;
    this.votesReceived.clear();
    this.leaderId = null;
  }

  // --- timers + tiny helpers ------------------------------------------

  private resetElectionTimer(context: NodeContext): void {
    const jitter = this.random.nextInt(
      this.config.electionTimeoutMinMs,
      this.config.electionTimeoutMaxMs,
    );
    this.electionDeadline = context.now() + jitter;
    context.scheduleTimer(this.electionDeadline, { kind: 'election' });
  }

  private hasMajority(context: NodeContext): boolean {
    return this.votesReceived.size >= this.majoritySize(context);
  }

  private majoritySize(context: NodeContext): number {
    return Math.floor((context.peers.length + 1) / 2) + 1;
  }

  private lastLogIndex(): number {
    return this.log.length - 1;
  }

  private lastLogTerm(): number {
    return this.log.length === 0 ? 0 : this.log[this.log.length - 1].term;
  }
}
