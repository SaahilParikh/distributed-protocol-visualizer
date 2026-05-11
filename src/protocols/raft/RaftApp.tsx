import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientPropose, RaftSnapshot } from './messages';
import { RaftNode } from './raft';
import { Network } from '../../sim/network';
import { seededRandom } from '../../sim/random';
import { Simulator } from '../../sim/simulator';
import type { NodeId } from '../../sim/types';
import { worldAt } from '../../trace/playback';
import { LogView } from '../../ui/LogView';
import { NetworkView } from '../../ui/NetworkView';

const NODE_POOL: readonly NodeId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const DEFAULT_NODE_COUNT = 10;
const MIN_NODES = 3;
const MAX_NODES = NODE_POOL.length;

const NETWORK_CONFIG = { minDelayMs: 10, maxDelayMs: 40, dropProbability: 0 };
const RAFT_CONFIG = {
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
  heartbeatIntervalMs: 50,
};
const SPEED_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 4];
const DEFAULT_SPEED = 0.05;

interface LiveState {
  readonly simulator: Simulator<RaftSnapshot>;
  readonly virtualTime: number;
  readonly tick: number;
}

function describeMessage(body: unknown): string {
  const message = body as { kind: string; term?: number };
  switch (message.kind) {
    case 'requestVote':
      return `RequestVote t=${message.term}`;
    case 'requestVoteResponse':
      return `Vote`;
    case 'appendEntries':
      return `AppendEntries`;
    case 'appendEntriesResponse':
      return `Ack`;
    case 'clientPropose':
      return `Client`;
    default:
      return message.kind;
  }
}

function buildSimulator(nodeIds: readonly NodeId[], seed: number, dropProbability: number): Simulator<RaftSnapshot> {
  const random = seededRandom(seed);
  const network = new Network({ ...NETWORK_CONFIG, dropProbability }, random);
  const simulator = new Simulator<RaftSnapshot>({
    nodeIds,
    makeProtocol: () => new RaftNode(RAFT_CONFIG, random),
    describeMessage,
    describeTimer: (token) => (token as { kind: string }).kind,
    network,
    random,
  });
  simulator.start();
  simulator.advanceTo(0);
  return simulator;
}

export default function RaftApp() {
  const [nodeCount, setNodeCount] = useState(DEFAULT_NODE_COUNT);
  const [seed, setSeed] = useState(1);
  const [dropProbability, setDropProbability] = useState(0.05);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [isRunning, setIsRunning] = useState(false);
  const [clientName, setClientName] = useState('alice');
  const [command, setCommand] = useState('x');

  const [live, setLive] = useState<LiveState | null>(null);
  const lastWallTimeRef = useRef<number | null>(null);
  const nodeIds = useMemo(() => NODE_POOL.slice(0, nodeCount), [nodeCount]);

  useEffect(() => {
    if (!isRunning || live === null) {
      lastWallTimeRef.current = null;
      return;
    }
    let raf = 0;
    const step = (wall: number) => {
      const last = lastWallTimeRef.current;
      lastWallTimeRef.current = wall;
      if (last !== null) {
        const delta = (wall - last) * speed;
        live.simulator.advanceTo(live.simulator.now() + delta);
        setLive({
          simulator: live.simulator,
          virtualTime: live.simulator.now(),
          tick: live.tick + 1,
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isRunning, live, speed]);

  useEffect(() => {
    if (live !== null) live.simulator.setDropProbability(dropProbability);
  }, [live, dropProbability]);

  const handleStart = useCallback(() => {
    const simulator = buildSimulator(nodeIds, seed, dropProbability);
    setLive({ simulator, virtualTime: 0, tick: 0 });
    setIsRunning(true);
  }, [nodeIds, seed, dropProbability]);

  const frame = useMemo(() => {
    if (live === null) {
      return { time: 0, nodeSnapshots: new Map(), inFlight: [] as const };
    }
    return worldAt<RaftSnapshot>(live.simulator.events(), live.virtualTime);
  }, [live]);

  const leaderId = useMemo(() => findLeader(frame.nodeSnapshots), [frame]);

  const handleSubmit = () => {
    if (live === null || leaderId === null) return;
    const trimmedCommand = command.trim() || 'x';
    const trimmedSource = clientName.trim() || 'anon';
    const proposal: ClientPropose = {
      kind: 'clientPropose',
      term: 0,
      command: trimmedCommand,
      source: trimmedSource,
    };
    live.simulator.submitCommand(leaderId, proposal);
    setLive({
      simulator: live.simulator,
      virtualTime: live.simulator.now(),
      tick: live.tick + 1,
    });
  };

  return (
    <div className="app">
      <header>
        <h1>Raft Visualizer</h1>
        <p>
          Start a 5-node cluster, submit entries, and raise the fault rate to watch Raft survive.
        </p>
      </header>

      <div className="controls">
        <label>
          Nodes:{' '}
          <input
            type="number"
            min={MIN_NODES}
            max={MAX_NODES}
            value={nodeCount}
            onChange={(event) => {
              const next = Number(event.target.value) || DEFAULT_NODE_COUNT;
              setNodeCount(Math.max(MIN_NODES, Math.min(MAX_NODES, next)));
            }}
            disabled={live !== null}
            style={{ width: '4rem' }}
          />
        </label>
        <label>
          Seed:{' '}
          <input
            type="number"
            value={seed}
            onChange={(event) => setSeed(Number(event.target.value) || 0)}
            disabled={live !== null}
          />
        </label>
        <button type="button" onClick={handleStart}>
          {live === null ? 'Start' : 'Restart'}
        </button>
        {live !== null && (
          <>
            <button type="button" onClick={() => setIsRunning((playing) => !playing)}>
              {isRunning ? 'Pause' : 'Play'}
            </button>
            <label>
              Speed:{' '}
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                {SPEED_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            <label className="fault-slider">
              Drop rate: {(dropProbability * 100).toFixed(0)}%
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={dropProbability}
                onChange={(event) => setDropProbability(Number(event.target.value))}
              />
            </label>
            <span className="time">t = {live.virtualTime.toFixed(0)} ms</span>
          </>
        )}
      </div>

      {live !== null && (
        <div className="controls submit-row">
          <label>
            Client:{' '}
            <input
              type="text"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              style={{ width: '6rem' }}
            />
          </label>
          <label>
            Command:{' '}
            <input
              type="text"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              style={{ width: '6rem' }}
            />
          </label>
          <button type="button" onClick={handleSubmit} disabled={leaderId === null}>
            {leaderId === null ? 'No leader' : `Submit to ${leaderId}`}
          </button>
        </div>
      )}

      <main>
        {live === null ? (
          <div className="empty">Click Start to begin.</div>
        ) : (
          <>
            <NetworkView nodeIds={nodeIds} frame={frame} />
            <LogView nodeIds={nodeIds} snapshots={frame.nodeSnapshots} />
          </>
        )}
      </main>
    </div>
  );
}

function findLeader(snapshots: ReadonlyMap<NodeId, RaftSnapshot>): NodeId | null {
  let best: { id: NodeId; term: number } | null = null;
  for (const [id, snapshot] of snapshots) {
    if (snapshot.role !== 'leader') continue;
    if (best === null || snapshot.currentTerm > best.term) {
      best = { id, term: snapshot.currentTerm };
    }
  }
  return best?.id ?? null;
}
