import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network } from '../../sim/network';
import { seededRandom } from '../../sim/random';
import { Simulator } from '../../sim/simulator';
import type { NodeId } from '../../sim/types';
import { hashToUnit } from '../../sim/hash';
import type { InFlightMessage, WorldFrame } from '../../trace/playback';
import { worldAt } from '../../trace/playback';
import type { ChordMessage, ChordSnapshot, Lookup } from './messages';
import { ChordNode, buildRing } from './chord';

const NODE_IDS: readonly NodeId[] = ['A', 'B', 'C', 'D', 'E'];
const NETWORK_CONFIG = { minDelayMs: 10, maxDelayMs: 40, dropProbability: 0 };
const SPEED_OPTIONS = [0.01, 0.1, 0.25, 0.5, 1, 2, 4];
const CANVAS_SIZE = 500;
const NODE_RADIUS = 32;
const RING_RADIUS = 180;

function describeMessage(body: unknown): string {
  const message = body as ChordMessage;
  return message.kind === 'lookup'
    ? `Lookup ${message.key}`
    : `Found ${message.owner}`;
}

function buildSimulator(seed: number, dropProbability: number): Simulator<ChordSnapshot> {
  const random = seededRandom(seed);
  const network = new Network({ ...NETWORK_CONFIG, dropProbability }, random);
  const ring = buildRing(NODE_IDS);
  const simulator = new Simulator<ChordSnapshot>({
    nodeIds: NODE_IDS,
    makeProtocol: (nodeId) => new ChordNode(ring.get(nodeId)!),
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
  readonly simulator: Simulator<ChordSnapshot>;
  readonly virtualTime: number;
  readonly tick: number;
}

export default function ChordApp() {
  const [seed, setSeed] = useState(1);
  const [dropProbability, setDropProbability] = useState(0.05);
  const [speed, setSpeed] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [origin, setOrigin] = useState<NodeId>('A');
  const [key, setKey] = useState('myfile');
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
    return worldAt<ChordSnapshot>(live.simulator.events(), live.virtualTime);
  }, [live]);

  const handleLookup = () => {
    if (live === null) return;
    const trimmed = key.trim() || 'key';
    const message: Lookup = {
      kind: 'lookup',
      key: trimmed,
      keyPosition: hashToUnit(trimmed),
      origin,
      path: [],
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
          <button type="button" onClick={handleLookup}>
            Lookup
          </button>
        </div>
      )}

      <main>
        {live === null ? (
          <div className="empty">Click Start to see the Chord ring.</div>
        ) : (
          <>
            <ChordRing frame={frame} />
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

function ChordRing({ frame }: { readonly frame: WorldFrame<ChordSnapshot> }): JSX.Element {
  const positions = positionsByHash(frame);
  return (
    <svg
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      role="img"
      aria-label="Chord ring visualization"
    >
      <circle
        cx={CANVAS_SIZE / 2}
        cy={CANVAS_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      {renderSuccessorArcs(frame, positions)}
      {[...positions.entries()].map(([nodeId, point]) => {
        const snapshot = frame.nodeSnapshots.get(nodeId);
        return (
          <g key={nodeId} transform={`translate(${point.x}, ${point.y})`}>
            <circle r={NODE_RADIUS} fill="#3b82f6" stroke="#0f172a" strokeWidth={2} />
            <text textAnchor="middle" y={-2} fontSize={18} fontWeight={700} fill="white">
              {nodeId}
            </text>
            <text textAnchor="middle" y={14} fontSize={10} fill="white">
              {snapshot ? snapshot.position.toFixed(2) : ''}
            </text>
          </g>
        );
      })}
      {frame.inFlight.map((message) => (
        <LookupToken key={message.messageId} message={message} positions={positions} />
      ))}
    </svg>
  );
}

function positionsByHash(frame: WorldFrame<ChordSnapshot>): Map<NodeId, Point> {
  const positions = new Map<NodeId, Point>();
  const center = CANVAS_SIZE / 2;
  for (const [nodeId, snapshot] of frame.nodeSnapshots) {
    const angle = snapshot.position * Math.PI * 2 - Math.PI / 2;
    positions.set(nodeId, {
      x: center + Math.cos(angle) * RING_RADIUS,
      y: center + Math.sin(angle) * RING_RADIUS,
    });
  }
  return positions;
}

function renderSuccessorArcs(
  frame: WorldFrame<ChordSnapshot>,
  positions: Map<NodeId, Point>,
): JSX.Element[] {
  const arcs: JSX.Element[] = [];
  for (const [nodeId, snapshot] of frame.nodeSnapshots) {
    const from = positions.get(nodeId);
    const to = positions.get(snapshot.successor);
    if (from === undefined || to === undefined) continue;
    arcs.push(
      <line
        key={`succ-${nodeId}`}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#e2e8f0"
        strokeWidth={1}
      />,
    );
  }
  return arcs;
}

function LookupToken({
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
  const color = message.label.startsWith('Lookup') ? '#0f172a' : '#16a34a';
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-34} y={-10} width={68} height={20} rx={10} fill={color} opacity={0.9} />
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
  readonly frame: WorldFrame<ChordSnapshot>;
}): JSX.Element {
  const all = [];
  for (const nodeId of nodeIds) {
    const snapshot = frame.nodeSnapshots.get(nodeId);
    if (snapshot === undefined) continue;
    for (const entry of snapshot.completed) {
      all.push({ originator: nodeId, ...entry });
    }
  }
  all.sort((a, b) => b.completedAt - a.completedAt);
  if (all.length === 0) {
    return <div className="log-empty">No lookups yet. Enter a key and click Lookup.</div>;
  }
  return (
    <div className="lookup-history">
      {all.map((entry, index) => (
        <div key={`${entry.key}-${entry.completedAt}-${index}`} className="lookup-entry">
          <span className="lookup-key">{entry.key}</span>
          <span className="lookup-arrow">→</span>
          <span className="lookup-owner">{entry.owner}</span>
          <span className="lookup-path">{entry.path.join(' → ')}</span>
          <span className="lookup-time">{entry.completedAt.toFixed(0)} ms</span>
        </div>
      ))}
    </div>
  );
}
