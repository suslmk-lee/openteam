import { useMemo } from 'react'
import { teamService } from '../services/teamService'

export function useTeamService() {
  return useMemo(() => teamService, [])
}
