/**
 * Turns one of our line icons (SVG snippets on a 24px grid, see ui/Icon.tsx) into plain path data,
 * so the map canvas can draw the same icons with Path2D. Pure; supports the shapes the icons use:
 * <path d>, <rect x y width height rx>, <circle cx cy r>. Anything else is reported as unsupported.
 */
export function iconPathData(svg: string): { d: string; unsupported: string[] } {
  const parts: string[] = [];
  const unsupported: string[] = [];
  for (const [, tag, attrText] of svg.matchAll(/<(\w+)\s*([^>]*?)\/?>/g)) {
    const a: Record<string, number> = {};
    let d = '';
    for (const [, k, v] of attrText.matchAll(/([\w-]+)="([^"]*)"/g)) { if (k === 'd') d = v; else a[k] = Number(v); }
    if (tag === 'path') parts.push(d);
    else if (tag === 'rect') {
      const { x = 0, y = 0, width: w = 0, height: h = 0 } = a;
      const r = Math.min(a.rx ?? 0, w / 2, h / 2);
      parts.push(r > 0
        ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
        : `M${x} ${y}H${x + w}V${y + h}H${x}Z`);
    } else if (tag === 'circle') {
      const { cx = 0, cy = 0, r = 0 } = a;
      parts.push(`M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`);
    } else unsupported.push(tag);
  }
  return { d: parts.join(''), unsupported };
}
