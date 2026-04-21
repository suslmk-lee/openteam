import { describe, expect, it } from 'vitest'
import { aggregateSeriesValues, buildMotionProfile } from './personalAiMotionProfile'

describe('personalAiMotionProfile', () => {
  it('aggregates values by day and sorts in ascending order', () => {
    const values = aggregateSeriesValues([
      {
        points: [
          { day: '2026-04-03', value: 20 },
          { day: '2026-04-01', value: 10 },
        ],
      },
      {
        points: [
          { day: '2026-04-01', value: 15 },
          { day: '2026-04-02', value: 5 },
        ],
      },
    ])

    expect(values).toEqual([25, 5, 20])
  })

  it('returns stable defaults for empty values', () => {
    expect(buildMotionProfile([])).toEqual({
      intensity: 0.15,
      volatility: 0.1,
      trend: 0,
      density: 0.1,
    })
  })

  it('calculates positive trend for increasing data', () => {
    const profile = buildMotionProfile([10, 20, 30, 60])
    expect(profile.trend).toBeGreaterThan(0)
    expect(profile.intensity).toBeGreaterThan(0)
    expect(profile.density).toBeGreaterThan(0)
  })
})
