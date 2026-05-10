type Point = { label: string; value: number }

export function BarChart({
  points,
  height = 120,
}: {
  points: Point[]
  height?: number
}) {
  const width = Math.max(points.length * 10, 240)
  const max = Math.max(1, ...points.map((p) => p.value))
  const barWidth = width / Math.max(1, points.length)

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="chart">
        {points.map((p, idx) => {
          const h = Math.round((p.value / max) * (height - 16))
          const x = idx * barWidth + 1
          const y = height - h - 1
          return <rect key={p.label} x={x} y={y} width={Math.max(1, barWidth - 2)} height={h} rx={2} />
        })}
      </svg>
    </div>
  )
}

