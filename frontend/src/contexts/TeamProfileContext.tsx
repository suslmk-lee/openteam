import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { GetTeamProfile } from '../../wailsjs/go/main/App'

export interface TeamProfile {
  teamType: string       // si_business | si_field | small_team | ''
  teamName: string
  userName: string
  memberCount: number
  setupDone: boolean
  linearApiKey: string
  linearTeamId: string
}

interface TeamProfileContextValue {
  profile: TeamProfile | null
  loading: boolean
  reload: () => Promise<void>
}

const TeamProfileContext = createContext<TeamProfileContextValue>({
  profile: null,
  loading: true,
  reload: async () => {},
})

export function TeamProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<TeamProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function reload() {
    try {
      const p = await GetTeamProfile()
      setProfile(p as TeamProfile)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  return (
    <TeamProfileContext.Provider value={{ profile, loading, reload }}>
      {children}
    </TeamProfileContext.Provider>
  )
}

export function useTeamProfile() {
  return useContext(TeamProfileContext)
}
