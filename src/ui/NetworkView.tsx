import type { JSX } from 'react';
import type { InFlightMessage, WorldFrame } from '../trace/playback';
import type { NodeId } from '../sim/types';
import type { RaftSnapshot } from '../protocols/raft/messages';

const CANVAS_SIZE = 520;
const RING_RADIUS = 200;
const NODE_RADIUS_FOR_COUNT = (count: number) => Math.max(20, 44 - count * 2);

const ROLE_COLORS: Record<RaftSnapshot['role'], string> = {
  follower: '#64748b',
  candidate: '#eab308',
  leader: '#22c55e',
};

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface NetworkViewProps {
  readonly nodeIds: readonly NodeId[];
  readonly frame: WorldFrame<RaftSnapshot>;
}

export function NetworkView({ nodeIds, frame }: NetworkViewProps) {
  const positions = placeNodesOnRing(nodeIds);
  const nodeRadius = NODE_RADIUS_FOR_COUNT(nodeIds.length);
  return (
    <svg
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      role="img"
      aria-label="Raft cluster visualization"
    >
      {renderArcs(nodeIds, positions)}
      {nodeIds.map((nodeId) => (
        <NodeCircle
          key={nodeId}
          position={positions.get(nodeId)!}
          nodeId={nodeId}
          snapshot={frame.nodeSnapshots.get(nodeId) ?? null}
          radius={nodeRadius}
        />
      ))}
      {frame.inFlight.map((message) => (
        <MessageToken key={message.messageId} message={message} positions={positions} />
      ))}
    </svg>
  );
}

function placeNodesOnRing(nodeIds: readonly NodeId[]): Map<NodeId, Point> {
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

function renderArcs(nodeIds: readonly NodeId[], positions: Map<NodeId, Point>) {
  const arcs: JSX.Element[] = [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    for (let j = i + 1; j < nodeIds.length; j += 1) {
      const a = positions.get(nodeIds[i])!;
      const b = positions.get(nodeIds[j])!;
      arcs.push(
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
  return arcs;
}

interface NodeCircleProps {
  readonly position: Point;
  readonly nodeId: NodeId;
  readonly snapshot: RaftSnapshot | null;
  readonly radius: number;
}

function NodeCircle({ position, nodeId, snapshot, radius }: NodeCircleProps) {
  const role = snapshot?.role ?? 'follower';
  const term = snapshot?.currentTerm ?? 0;
  const logLength = snapshot?.log.length ?? 0;
  const commitIndex = snapshot?.commitIndex ?? -1;
  return (
    <g transform={`translate(${position.x}, ${position.y})`}>
      <circle r={radius} fill={ROLE_COLORS[role]} stroke="#0f172a" strokeWidth={2} />
      <text textAnchor="middle" y={-6} fontSize={20} fontWeight={700} fill="white">
        {nodeId}
      </text>
      <text textAnchor="middle" y={12} fontSize={11} fill="white">
        t={term}
      </text>
      <text textAnchor="middle" y={26} fontSize={10} fill="white">
        {logLength > 0 ? `log ${commitIndex + 1}/${logLength}` : role}
      </text>
    </g>
  );
}

interface MessageTokenProps {
  readonly message: InFlightMessage;
  readonly positions: Map<NodeId, Point>;
}

function MessageToken({ message, positions }: MessageTokenProps) {
  const from = positions.get(message.from);
  const to = positions.get(message.to);
  if (from === undefined || to === undefined) return null;
  const x = from.x + (to.x - from.x) * message.progress;
  const y = from.y + (to.y - from.y) * message.progress;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-28} y={-10} width={56} height={20} rx={10} fill="#0f172a" opacity={0.9} />
      <text textAnchor="middle" y={4} fontSize={10} fill="white">
        {message.label.slice(0, 12)}
      </text>
    </g>
  );
}
