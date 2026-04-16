import { useMemo } from 'react'
import { appApi, type AppApi } from '../services/appApi'

export function useAppApi(): AppApi {
  return useMemo(() => appApi, [])
}
