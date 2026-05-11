// Deterministic hue per client name.
export function colorForSource(source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
}
