type Point = { label: string; value: number }

export function DivergingBarChart({
  points,
  height = 120,
}: {
  points: Point[]
  height?: number
}) {
  const width = Math.max(points.length * 10, 240)
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value)))
  const barWidth = width / Math.max(1, points.length)
  const mid = height / 2
  const usable = mid - 10

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="chart">
        <line x1={0} y1={mid} x2={width} y2={mid} />
        {points.map((p, idx) => {
          const scaled = (Math.abs(p.value) / maxAbs) * usable
          const x = idx * barWidth + 1
          const y = p.value >= 0 ? mid - scaled : mid
          const h = scaled
          const cls = p.value === 0 ? 'bar bar--zero' : p.value > 0 ? 'bar bar--pos' : 'bar bar--neg'
          return (
            <rect
              key={p.label}
              className={cls}
              x={x}
              y={y}
              width={Math.max(1, barWidth - 2)}
              height={h}
              rx={2}
            />
          )
        })}
      </svg>
    </div>
  )
}

