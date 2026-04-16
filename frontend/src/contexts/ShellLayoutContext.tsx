import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface ShellLayoutContextValue {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (value: boolean) => void
  toggleSidebar: () => void
}

const ShellLayoutContext = createContext<ShellLayoutContextValue>({
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
  toggleSidebar: () => {},
})

export function ShellLayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed(prev => !prev),
    }),
    [sidebarCollapsed],
  )

  return <ShellLayoutContext.Provider value={value}>{children}</ShellLayoutContext.Provider>
}

export function useShellLayout() {
  return useContext(ShellLayoutContext)
}
