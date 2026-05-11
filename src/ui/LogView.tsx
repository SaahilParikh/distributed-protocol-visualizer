import type { NodeId } from '../sim/types';
import type { RaftSnapshot } from '../protocols/raft/messages';
import { colorForSource } from './colorForSource';

export interface LogViewProps {
  readonly nodeIds: readonly NodeId[];
  readonly snapshots: ReadonlyMap<NodeId, RaftSnapshot>;
}

export function LogView({ nodeIds, snapshots }: LogViewProps) {
  const maxLogLength = computeMaxLogLength(nodeIds, snapshots);
  if (maxLogLength === 0) {
    return <div className="log-empty">No log entries yet. Click Submit to propose one.</div>;
  }
  return (
    <div className="log-view">
      {nodeIds.map((nodeId) => (
        <LogRow
          key={nodeId}
          nodeId={nodeId}
          snapshot={snapshots.get(nodeId) ?? null}
          length={maxLogLength}
        />
      ))}
    </div>
  );
}

interface LogRowProps {
  readonly nodeId: NodeId;
  readonly snapshot: RaftSnapshot | null;
  readonly length: number;
}

function LogRow({ nodeId, snapshot, length }: LogRowProps) {
  const entries = snapshot?.log ?? [];
  const commitIndex = snapshot?.commitIndex ?? -1;
  return (
    <div className="log-row">
      <span className="log-node-label">{nodeId}</span>
      <div className="log-cells">
        {Array.from({ length }, (_, index) => {
          const entry = entries[index] ?? null;
          const committed = index <= commitIndex;
          return (
            <div
              key={index}
              className={`log-cell ${entry === null ? 'empty' : committed ? 'committed' : 'pending'}`}
              style={{ backgroundColor: entry !== null ? colorForSource(entry.source) : undefined }}
              title={entry !== null ? `${entry.source}: ${entry.command} (term ${entry.term})` : ''}
            >
              {entry?.command.slice(0, 3) ?? ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeMaxLogLength(
  nodeIds: readonly NodeId[],
  snapshots: ReadonlyMap<NodeId, RaftSnapshot>,
): number {
  let max = 0;
  for (const nodeId of nodeIds) {
    const length = snapshots.get(nodeId)?.log.length ?? 0;
    if (length > max) max = length;
  }
  return max;
}
