import type { TraceEvent } from './events';

export class TraceRecorder {
  private readonly events: TraceEvent[] = [];

  record(event: TraceEvent): void {
    this.events.push(event);
  }

  finish(): readonly TraceEvent[] {
    return this.events;
  }
}
