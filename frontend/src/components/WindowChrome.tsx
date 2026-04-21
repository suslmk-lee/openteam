import { ArrowLeft, ArrowRight, Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Quit, WindowIsMaximised, WindowMinimise, WindowToggleMaximise } from '../../wailsjs/runtime/runtime'
import { useShellLayout } from '../contexts/ShellLayoutContext'

const MENU_ITEMS = ['File', 'Edit', 'View', 'Window', 'Help']

type RuntimeWindow = Window & {
  runtime?: unknown
}

function hasWailsRuntime() {
  if (typeof window === 'undefined') return false
  return Boolean((window as RuntimeWindow).runtime)
}

export default function WindowChrome() {
  const { sidebarCollapsed, toggleSidebar } = useShellLayout()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMaximised, setIsMaximised] = useState(false)
  const showSidebarToggle = !location.pathname.startsWith('/onboarding')
  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose

  useEffect(() => {
    if (!hasWailsRuntime()) return
    let active = true
    WindowIsMaximised()
      .then(value => {
        if (active) setIsMaximised(value)
      })
      .catch(() => {
        if (active) setIsMaximised(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!showSidebarToggle) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return

      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.getAttribute('contenteditable') === 'true')
      ) {
        return
      }

      event.preventDefault()
      toggleSidebar()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSidebarToggle, toggleSidebar])

  function handleMinimise() {
    if (!hasWailsRuntime()) return
    WindowMinimise()
  }

  function handleToggleMaximise() {
    if (!hasWailsRuntime()) return
    WindowToggleMaximise()
    setIsMaximised(prev => !prev)
  }

  function handleClose() {
    if (!hasWailsRuntime()) return
    Quit()
  }

  return (
    <header className="window-chrome app-drag-region">
      <div className="window-chrome-left">
        {showSidebarToggle && (
          <button
            type="button"
            className="window-icon-button app-no-drag"
            aria-label="사이드바 토글"
            title="사이드바 토글 (Ctrl+B)"
            onClick={toggleSidebar}
          >
            <SidebarToggleIcon size={14} />
          </button>
        )}
        <button type="button" className="window-icon-button app-no-drag" aria-label="Go back" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} />
        </button>
        <button type="button" className="window-icon-button app-no-drag" aria-label="Go forward" onClick={() => navigate(1)}>
          <ArrowRight size={14} />
        </button>
      </div>

      <nav className="window-chrome-menu">
        {MENU_ITEMS.map(item => (
          <button key={item} type="button" className="window-menu-button app-no-drag">
            {item}
          </button>
        ))}
      </nav>

      <div className="window-title">OpenReport</div>

      <div className="window-controls app-no-drag">
        <button type="button" className="window-control-button" aria-label="Minimise" onClick={handleMinimise}>
          <Minus size={14} />
        </button>
        <button type="button" className="window-control-button" aria-label={isMaximised ? 'Restore down' : 'Maximise'} onClick={handleToggleMaximise}>
          {isMaximised ? <Copy size={13} /> : <Square size={13} />}
        </button>
        <button type="button" className="window-control-button window-control-close" aria-label="Close" onClick={handleClose}>
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
