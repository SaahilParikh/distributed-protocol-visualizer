import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network } from '../../sim/network';
import { seededRandom } from '../../sim/random';
import { Simulator } from '../../sim/simulator';
import type { NodeId } from '../../sim/types';
import type { InFlightMessage, WorldFrame } from '../../trace/playback';
import { worldAt } from '../../trace/playback';
import type { FindNode, KademliaMessage, KademliaSnapshot } from './messages';
import { KademliaNode, buildKademliaCluster, kademliaIdFor } from './kademlia';

const NODE_IDS: readonly NodeId[] = ['A', 'B', 'C', 'D', 'E'];
const NETWORK_CONFIG = { minDelayMs: 10, maxDelayMs: 40, dropProbability: 0 };
const SPEED_OPTIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 4];
const DEFAULT_SPEED = 0.05;
const CANVAS_SIZE = 500;
const NODE_RADIUS = 40;
const RING_RADIUS = 180;

function describeMessage(body: unknown): string {
  const message = body as KademliaMessage;
  return message.kind === 'findNode' ? `FindNode ${message.key}` : `Found ${message.owner.nodeId}`;
}

function buildSimulator(seed: number, dropProbability: number): Simulator<KademliaSnapshot> {
  const random = seededRandom(seed);
  const network = new Network({ ...NETWORK_CONFIG, dropProbability }, random);
  const cluster = buildKademliaCluster(NODE_IDS);
  const simulator = new Simulator<KademliaSnapshot>({
    nodeIds: NODE_IDS,
    makeProtocol: (nodeId) => new KademliaNode(cluster.get(nodeId)!),
    describeMessage,
    describeTimer: () => '',
    network,
    random,
  });
  simulator.start();
  simulator.advanceTo(0);
  return simulator;
}

interface LiveState {
  readonly simulator: Simulator<KademliaSnapshot>;
  readonly virtualTime: number;
  readonly tick: number;
}

export default function KademliaApp() {
  const [seed, setSeed] = useState(1);
  const [dropProbability, setDropProbability] = useState(0.05);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [isRunning, setIsRunning] = useState(false);
  const [origin, setOrigin] = useState<NodeId>('A');
  const [key, setKey] = useState('hello');
  const [live, setLive] = useState<LiveState | null>(null);
  const lastWallRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning || live === null) {
      lastWallRef.current = null;
      return;
    }
    let raf = 0;
    const step = (wall: number) => {
      const last = lastWallRef.current;
      lastWallRef.current = wall;
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
    const simulator = buildSimulator(seed, dropProbability);
    setLive({ simulator, virtualTime: 0, tick: 0 });
    setIsRunning(true);
  }, [seed, dropProbability]);

  const frame = useMemo(() => {
    if (live === null) {
      return { time: 0, nodeSnapshots: new Map(), inFlight: [] as const };
    }
    return worldAt<KademliaSnapshot>(live.simulator.events(), live.virtualTime);
  }, [live]);

  const targetKeyId = useMemo(() => kademliaIdFor(key.trim() || 'key'), [key]);

  const handleLookup = () => {
    if (live === null) return;
    const trimmed = key.trim() || 'key';
    const message: FindNode = {
      kind: 'findNode',
      key: trimmed,
      keyId: kademliaIdFor(trimmed),
      origin,
      visited: [],
    };
    live.simulator.submitCommand(origin, message);
    setLive({
      simulator: live.simulator,
      virtualTime: live.simulator.now(),
      tick: live.tick + 1,
    });
  };

  return (
    <>
      <div className="controls">
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
            Origin:{' '}
            <select value={origin} onChange={(event) => setOrigin(event.target.value)}>
              {NODE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Key:{' '}
            <input
              type="text"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              style={{ width: '8rem' }}
            />
          </label>
          <span className="key-id">id {targetKeyId}</span>
          <button type="button" onClick={handleLookup}>
            Lookup
          </button>
        </div>
      )}

      <main>
        {live === null ? (
          <div className="empty">Click Start to see the Kademlia overlay.</div>
        ) : (
          <>
            <KademliaRing frame={frame} targetKey={key.trim() || 'key'} targetKeyId={targetKeyId} />
            <LookupHistory nodeIds={NODE_IDS} frame={frame} />
          </>
        )}
      </main>
    </>
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function KademliaRing({
  frame,
  targetKey,
  targetKeyId,
}: {
  readonly frame: WorldFrame<KademliaSnapshot>;
  readonly targetKey: string;
  readonly targetKeyId: number;
}): JSX.Element {
  const positions = placeOnRing(NODE_IDS);
  return (
    <svg
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      role="img"
      aria-label="Kademlia cluster visualization"
    >
      {renderPeerLines(NODE_IDS, positions)}
      <g>
        <text
          x={CANVAS_SIZE / 2}
          y={CANVAS_SIZE / 2 - 10}
          textAnchor="middle"
          fontSize={14}
          fill="#475569"
        >
          target
        </text>
        <text
          x={CANVAS_SIZE / 2}
          y={CANVAS_SIZE / 2 + 14}
          textAnchor="middle"
          fontSize={20}
          fontWeight={700}
          fill="#dc2626"
        >
          {targetKey}
        </text>
        <text
          x={CANVAS_SIZE / 2}
          y={CANVAS_SIZE / 2 + 32}
          textAnchor="middle"
          fontSize={11}
          fill="#dc2626"
        >
          id {targetKeyId}
        </text>
      </g>
      {NODE_IDS.map((nodeId) => {
        const snapshot = frame.nodeSnapshots.get(nodeId);
        return (
          <NodeCircle
            key={nodeId}
            position={positions.get(nodeId)!}
            nodeId={nodeId}
            snapshot={snapshot}
            targetKeyId={targetKeyId}
          />
        );
      })}
      {frame.inFlight.map((message) => (
        <HopToken key={message.messageId} message={message} positions={positions} />
      ))}
    </svg>
  );
}

function placeOnRing(nodeIds: readonly NodeId[]): Map<NodeId, Point> {
  const center = CANVAS_SIZE / 2;
  const positions = new Map<NodeId, Point>();
  nodeIds.forEach((nodeId, index) => {
    const angle = (index / nodeIds.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(nodeId, {
      x: center + Math.cos(angle) * RING_RADIUS,
      y: center + Math.sin(angle) * RING_RADIUS,
    });
  });
  return positions;
}

function renderPeerLines(nodeIds: readonly NodeId[], positions: Map<NodeId, Point>): JSX.Element[] {
  const lines: JSX.Element[] = [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    for (let j = i + 1; j < nodeIds.length; j += 1) {
      const a = positions.get(nodeIds[i])!;
      const b = positions.get(nodeIds[j])!;
      lines.push(
        <line
          key={`${nodeIds[i]}-${nodeIds[j]}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#e2e8f0"
          strokeWidth={1}
        />,
      );
    }
  }
  return lines;
}

function NodeCircle({
  position,
  nodeId,
  snapshot,
  targetKeyId,
}: {
  readonly position: Point;
  readonly nodeId: NodeId;
  readonly snapshot: KademliaSnapshot | undefined;
  readonly targetKeyId: number;
}): JSX.Element {
  const kademliaId = snapshot?.kademliaId;
  const distance = kademliaId !== undefined ? kademliaId ^ targetKeyId : null;
  return (
    <g transform={`translate(${position.x}, ${position.y})`}>
      <circle r={NODE_RADIUS} fill="#3b82f6" stroke="#0f172a" strokeWidth={2} />
      <text textAnchor="middle" y={-8} fontSize={20} fontWeight={700} fill="white">
        {nodeId}
      </text>
      <text textAnchor="middle" y={10} fontSize={11} fill="white">
        id {kademliaId ?? '?'}
      </text>
      {distance !== null && (
        <text textAnchor="middle" y={26} fontSize={10} fill="white">
          d = {distance}
        </text>
      )}
    </g>
  );
}

function HopToken({
  message,
  positions,
}: {
  readonly message: InFlightMessage;
  readonly positions: Map<NodeId, Point>;
}): JSX.Element | null {
  const from = positions.get(message.from);
  const to = positions.get(message.to);
  if (from === undefined || to === undefined) return null;
  const x = from.x + (to.x - from.x) * message.progress;
  const y = from.y + (to.y - from.y) * message.progress;
  const color = message.label.startsWith('FindNode') ? '#0f172a' : '#16a34a';
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-44} y={-10} width={88} height={20} rx={10} fill={color} opacity={0.9} />
      <text textAnchor="middle" y={4} fontSize={10} fill="white">
        {message.label.slice(0, 16)}
      </text>
    </g>
  );
}

function LookupHistory({
  nodeIds,
  frame,
}: {
  readonly nodeIds: readonly NodeId[];
  readonly frame: WorldFrame<KademliaSnapshot>;
}): JSX.Element {
  const entries = [];
  for (const nodeId of nodeIds) {
    const snapshot = frame.nodeSnapshots.get(nodeId);
    if (snapshot === undefined) continue;
    for (const entry of snapshot.completed) {
      entries.push({ origin: nodeId, ...entry });
    }
  }
  if (entries.length === 0) {
    return <div className="log-empty">No lookups yet.</div>;
  }
  return (
    <div className="lookup-history">
      {entries.map((entry, index) => (
        <div key={index} className="lookup-entry">
          <span className="lookup-key">
            {entry.key} ({entry.keyId})
          </span>
          <span className="lookup-arrow">→</span>
          <span className="lookup-owner">{entry.owner.nodeId}</span>
          <span className="lookup-path">{entry.path.join(' → ')}</span>
        </div>
      ))}
    </div>
  );
}
