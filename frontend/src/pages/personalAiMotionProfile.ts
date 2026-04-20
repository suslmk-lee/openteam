export type MotionProfile = {
  intensity: number
  volatility: number
  trend: number
  density: number
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function aggregateSeriesValues(series: Array<{ points: Array<{ day: string; value: number }> }>): number[] {
  const bucket = new Map<string, number>()
  for (const item of series) {
    for (const point of item.points) {
      bucket.set(point.day, (bucket.get(point.day) || 0) + point.value)
    }
  }

  return Array.from(bucket.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((entry) => entry[1])
}

export function buildMotionProfile(values: number[]): MotionProfile {
  if (values.length === 0) {
    return { intensity: 0.15, volatility: 0.1, trend: 0, density: 0.1 }
  }

  const count = values.length
  const max = Math.max(...values, 1)
  const avg = values.reduce((sum, value) => sum + value, 0) / count
  const variance = values.reduce((sum, value) => {
    const diff = value - avg
    return sum + diff * diff
  }, 0) / count
  const std = Math.sqrt(variance)
  const start = values[0]
  const end = values[count - 1]

  const intensity = clamp01(avg / max)
  const volatility = clamp01(std / (avg + 1e-6))
  const trend = clamp01((end - start) / (Math.max(Math.abs(end), Math.abs(start), 1) * 2) + 0.5) * 2 - 1
  const density = clamp01(count / 31)

  if (!Number.isFinite(trend)) {
    return { intensity, volatility, trend: 0, density }
  }
  return { intensity, volatility, trend, density }
}
