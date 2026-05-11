import type { NodeId } from '../../sim/types';

export interface LogEntry {
  readonly term: number;
  readonly command: string;
  readonly source: string;
}

export type RaftRole = 'follower' | 'candidate' | 'leader';

export interface RequestVote {
  readonly kind: 'requestVote';
  readonly term: number;
  readonly candidateId: NodeId;
  readonly lastLogIndex: number;
  readonly lastLogTerm: number;
}

export interface RequestVoteResponse {
  readonly kind: 'requestVoteResponse';
  readonly term: number;
  readonly voteGranted: boolean;
  readonly voter: NodeId;
}

export interface AppendEntries {
  readonly kind: 'appendEntries';
  readonly term: number;
  readonly leaderId: NodeId;
  readonly prevLogIndex: number;
  readonly prevLogTerm: number;
  readonly entries: readonly LogEntry[];
  readonly leaderCommit: number;
}

export interface AppendEntriesResponse {
  readonly kind: 'appendEntriesResponse';
  readonly term: number;
  readonly success: boolean;
  readonly follower: NodeId;
  readonly matchIndex: number;
}

// Not an RPC — injected by the simulator to represent an external client.
export interface ClientPropose {
  readonly kind: 'clientPropose';
  readonly term: number;
  readonly command: string;
  readonly source: string;
}

export type RaftMessage =
  | RequestVote
  | RequestVoteResponse
  | AppendEntries
  | AppendEntriesResponse
  | ClientPropose;

export interface RaftSnapshot {
  readonly role: RaftRole;
  readonly currentTerm: number;
  readonly votedFor: NodeId | null;
  readonly log: readonly LogEntry[];
  readonly commitIndex: number;
  readonly leaderId: NodeId | null;
}

export type RaftTimer =
  | { readonly kind: 'election' }
  | { readonly kind: 'heartbeat' };
