export class VirtualClock {
  private current = 0;

  now(): number {
    return this.current;
  }

  advanceTo(time: number): void {
    if (time < this.current) {
      throw new Error(`cannot rewind clock from ${this.current} to ${time}`);
    }
    this.current = time;
  }
}
