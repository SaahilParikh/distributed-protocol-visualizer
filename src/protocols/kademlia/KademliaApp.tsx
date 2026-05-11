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
const SPEED_OPTIONS = [0.01, 0.1, 0.25, 0.5, 1, 2, 4];
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 320;
const LEFT_MARGIN = 40;
const RIGHT_MARGIN = 40;
const AXIS_Y = 240;
const NODE_RADIUS = 24;
const ID_SPACE = 256;

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
  const [speed, setSpeed] = useState(1);
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
          <span className="key-id">→ id {targetKeyId}</span>
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
            <KademliaLine frame={frame} targetKeyId={targetKeyId} />
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

function KademliaLine({
  frame,
  targetKeyId,
}: {
  readonly frame: WorldFrame<KademliaSnapshot>;
  readonly targetKeyId: number;
}): JSX.Element {
  const positions = positionsByKademliaId(frame);
  const targetX = xForKademliaId(targetKeyId);
  return (
    <svg
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      width="100%"
      style={{ maxWidth: CANVAS_WIDTH }}
      role="img"
      aria-label="Kademlia number line"
    >
      <line
        x1={LEFT_MARGIN}
        y1={AXIS_Y}
        x2={CANVAS_WIDTH - RIGHT_MARGIN}
        y2={AXIS_Y}
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      <text x={LEFT_MARGIN} y={AXIS_Y + 24} fontSize={11} fill="#94a3b8">
        0
      </text>
      <text x={CANVAS_WIDTH - RIGHT_MARGIN} y={AXIS_Y + 24} fontSize={11} fill="#94a3b8" textAnchor="end">
        255
      </text>

      <g>
        <line
          x1={targetX}
          y1={AXIS_Y - 80}
          x2={targetX}
          y2={AXIS_Y + 12}
          stroke="#dc2626"
          strokeDasharray="4 3"
          strokeWidth={1.5}
        />
        <text x={targetX} y={AXIS_Y - 88} fontSize={11} fill="#dc2626" textAnchor="middle">
          target {targetKeyId}
        </text>
      </g>

      {[...positions.entries()].map(([nodeId, point]) => (
        <NodeMarker
          key={nodeId}
          nodeId={nodeId}
          point={point}
          snapshot={frame.nodeSnapshots.get(nodeId)}
        />
      ))}

      {frame.inFlight.map((message) => (
        <HopToken key={message.messageId} message={message} positions={positions} />
      ))}
    </svg>
  );
}

function positionsByKademliaId(frame: WorldFrame<KademliaSnapshot>): Map<NodeId, Point> {
  const positions = new Map<NodeId, Point>();
  for (const [nodeId, snapshot] of frame.nodeSnapshots) {
    positions.set(nodeId, { x: xForKademliaId(snapshot.kademliaId), y: AXIS_Y });
  }
  return positions;
}

function xForKademliaId(id: number): number {
  const usable = CANVAS_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
  return LEFT_MARGIN + (id / (ID_SPACE - 1)) * usable;
}

function NodeMarker({
  nodeId,
  point,
  snapshot,
}: {
  readonly nodeId: NodeId;
  readonly point: Point;
  readonly snapshot: KademliaSnapshot | undefined;
}): JSX.Element {
  return (
    <g transform={`translate(${point.x}, ${point.y})`}>
      <line y1={0} y2={-2} stroke="#0f172a" strokeWidth={2} />
      <circle cy={-NODE_RADIUS - 4} r={NODE_RADIUS} fill="#3b82f6" stroke="#0f172a" strokeWidth={2} />
      <text textAnchor="middle" y={-NODE_RADIUS - 1} fontSize={16} fontWeight={700} fill="white">
        {nodeId}
      </text>
      <text textAnchor="middle" y={-NODE_RADIUS + 12} fontSize={9} fill="white">
        id {snapshot?.kademliaId ?? '?'}
      </text>
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
  const arcHeight = 70;
  const y = AXIS_Y - NODE_RADIUS * 2 - arcHeight * Math.sin(Math.PI * message.progress) - 10;
  const color = message.label.startsWith('FindNode') ? '#0f172a' : '#16a34a';
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-40} y={-10} width={80} height={20} rx={10} fill={color} opacity={0.9} />
      <text textAnchor="middle" y={4} fontSize={10} fill="white">
        {message.label.slice(0, 14)}
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
