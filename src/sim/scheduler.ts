// Min-heap keyed by (deliverAt, insertion order). Insertion-order ties
// keep replay deterministic for a given seed.

export interface ScheduledEvent<T> {
  deliverAt: number;
  payload: T;
}

export class EventScheduler<T> {
  private readonly heap: Array<{ deliverAt: number; seq: number; payload: T }> = [];
  private sequenceCounter = 0;

  schedule(deliverAt: number, payload: T): void {
    this.heap.push({ deliverAt, seq: this.sequenceCounter++, payload });
    this.bubbleUp(this.heap.length - 1);
  }

  peek(): ScheduledEvent<T> | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  pop(): ScheduledEvent<T> | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  size(): number {
    return this.heap.length;
  }

  private bubbleUp(startIndex: number): void {
    let index = startIndex;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.comesBefore(this.heap[index], this.heap[parentIndex])) {
        this.swap(index, parentIndex);
        index = parentIndex;
      } else {
        return;
      }
    }
  }

  private sinkDown(startIndex: number): void {
    let index = startIndex;
    const n = this.heap.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < n && this.comesBefore(this.heap[left], this.heap[smallest])) smallest = left;
      if (right < n && this.comesBefore(this.heap[right], this.heap[smallest])) smallest = right;
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private comesBefore(
    a: { deliverAt: number; seq: number },
    b: { deliverAt: number; seq: number },
  ): boolean {
    return a.deliverAt !== b.deliverAt ? a.deliverAt < b.deliverAt : a.seq < b.seq;
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }
}
