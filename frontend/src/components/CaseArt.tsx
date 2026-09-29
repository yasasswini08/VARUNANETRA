/** Abstract SAR-style artwork for demo cases. Deterministic per hue; clearly illustrative, not data. */
export function CaseArt({ hue, seed }: { hue: number; seed: number }) {
  const id = `g${seed}`
  const blob = (cx: number, cy: number, s: number) =>
    `M${cx - 60 * s},${cy} C${cx - 50 * s},${cy - 40 * s} ${cx + 20 * s},${cy - 50 * s} ${cx + 70 * s},${cy - 15 * s} C${cx + 100 * s},${cy + 10 * s} ${cx + 30 * s},${cy + 45 * s} ${cx - 20 * s},${cy + 30 * s} C${cx - 55 * s},${cy + 22 * s} ${cx - 70 * s},${cy + 10 * s} ${cx - 60 * s},${cy}Z`
  const cx = 130 + ((seed * 83) % 150)
  const cy = 70 + ((seed * 29) % 40)
  const rot = (seed * 47) % 70 - 35
  const sc = 0.9 + ((seed * 13) % 6) / 10
  return (
    <svg viewBox="0 0 400 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 70% 8%)`} /><stop offset="1" stopColor={`hsl(${hue} 60% 20%)`} />
        </linearGradient>
        <radialGradient id={`${id}s`}>
          <stop offset="0" stopColor="#ff5a4d" stopOpacity=".95" /><stop offset=".55" stopColor="#f2b53f" stopOpacity=".5" /><stop offset="1" stopColor="#3fd8e8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="170" fill={`url(#${id}b)`} />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M0 ${20 + i * 18} Q100 ${10 + i * 18 + (seed % 3) * 6} 200 ${22 + i * 18} T400 ${18 + i * 18}`} stroke="rgba(143,190,228,.09)" fill="none" />)}
      <g transform={`rotate(${rot} ${cx} ${cy})`}>
        <path d={blob(cx, cy, 1.3 * sc)} fill={`url(#${id}s)`} />
        <path d={blob(cx, cy, 0.8 * sc)} fill="rgba(255,90,77,.28)" />
      </g>
      <path d={`M${20} 150 Q${120} ${110 - (seed % 4) * 8} ${cx} ${cy}`} stroke="#3fd8e8" strokeDasharray="4 4" fill="none" opacity=".6" />
      <circle cx="20" cy="150" r="3.5" fill="#3fd8e8" />
    </svg>
  )
}
