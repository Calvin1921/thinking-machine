// packages/core/src/layout.ts
export interface Pt { x: number; y: number; }

const DX = 320;   // horizontal gap parent -> child
const DY = 150;   // vertical gap between siblings

/** Place `count` children to the right of `parent`, vertically centered. */
export function placeChildren(parent: Pt, count: number): Pt[] {
  const startY = parent.y - ((count - 1) * DY) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: parent.x + DX, y: startY + i * DY }));
}
