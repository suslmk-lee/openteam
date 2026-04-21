import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  User,
  Settings,
  ChevronDown,
  ChevronUp,
  UserCog,
  Clock,
  Briefcase,
  FileText,
  FilePlus,
  Building2,
  ListTree,
  AlertTriangle,
  GitBranch,
  RotateCcw,
  Kanban,
  Mail,
  Calendar,
  Database,
  BookOpen,
  Bot,
} from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import { useShellLayout } from '../contexts/ShellLayoutContext'

export default function Layout() {
  const { sidebarCollapsed: collapsed } = useShellLayout()
  const [openMenu, setOpenMenu] = useState<null | 'vault' | 'report' | 'team' | 'workData' | 'settings'>(null)
  const { profile, loading } = useTeamProfile()
  const navigate = useNavigate()
  const location = useLocation()

  const vaultMenuOpen = openMenu === 'vault'
  const reportMenuOpen = openMenu === 'report'
  const teamMenuOpen = openMenu === 'team'
  const workDataMenuOpen = openMenu === 'workData'
  const settingsMenuOpen = openMenu === 'settings'

  const setOnlyMenu = (menu: 'vault' | 'report' | 'team' | 'workData' | 'settings') => {
    setOpenMenu(prev => (prev === menu ? null : menu))
  }

  const subMenuTransitionStyle = (open: boolean): CSSProperties => ({
    maxHeight: open ? '28rem' : '0px',
    opacity: open ? 1 : 0,
    transform: open ? 'translateY(0)' : 'translateY(-4px)',
    pointerEvents: open ? 'auto' : 'none',
  })

  // Redirect to onboarding if not setup
  useEffect(() => {
    if (loading) return
    const needsOnboarding = !profile || !profile.setupDone
    if (needsOnboarding) {
      navigate('/onboarding', { replace: true })
    }
  }, [loading, profile, navigate])

  useEffect(() => {
    if (location.pathname.startsWith('/vault')) {
      setOpenMenu('vault')
    }
  }, [location.pathname])

  if (loading) return null

  const teamType = profile?.teamType || 'personal'

  // Team menu items by team type
  const teamMenuItems = (() => {
    const base = [
      { to: '/team/members', icon: <UserCog size={18} />, label: '팀원관리' },
      { to: '/team/attendance', icon: <Clock size={18} />, label: '근태관리' },
    ]
    if (teamType === 'si_business') {
      return [
        ...base,
        { to: '/team/clients', icon: <Building2 size={18} />, label: '고객사관리' },
        { to: '/team/projects', icon: <Briefcase size={18} />, label: '프로젝트관리' },
      ]
    }
    if (teamType === 'si_field') {
      return [
        ...base,
        { to: '/team/clients', icon: <Building2 size={18} />, label: '고객사관리' },
        { to: '/team/projects', icon: <Briefcase size={18} />, label: '프로젝트관리' },
        { to: '/team/issues', icon: <AlertTriangle size={18} />, label: '이슈/리스크' },
        { to: '/team/linear', icon: <GitBranch size={18} />, label: 'Linear 대시보드' },
      ]
    }
    if (teamType === 'small_team') {
      return [
        ...base,
        { to: '/team/taskboard', icon: <Kanban size={18} />, label: 'Linear 태스크보드' },
        { to: '/team/retro', icon: <RotateCcw size={18} />, label: '주간 회고' },
      ]
    }
    if (teamType === 'personal') {
      return [
        { to: '/team/taskboard', icon: <Kanban size={18} />, label: '개인 태스크보드' },
        { to: '/team/retro', icon: <RotateCcw size={18} />, label: '주간 회고' },
      ]
    }
    return base
  })()

  const teamTypeLabel = teamType === 'si_business' ? 'SI 사업팀'
    : teamType === 'si_field' ? '현장 SI팀'
    : teamType === 'small_team' ? '소규모팀'
    : teamType === 'personal' ? '개인용'
    : ''

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] flex flex-col transition-all duration-200 shrink-0`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-slate-700 dark:border-slate-600">
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold text-white tracking-tight leading-tight">OpenReport</h1>
              {teamTypeLabel && (
                <p className="text-xs text-slate-400 dark:text-slate-500 leading-tight">{profile?.teamName || teamTypeLabel}</p>
              )}
            </div>
          )}
          {collapsed && (
            <span className="text-lg font-bold text-white mx-auto">OR</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          <SidebarLink to="/" icon={<LayoutDashboard size={20} />} label="대시보드" collapsed={collapsed} />
          {collapsed ? (
            <SidebarLink to="/vault/explore" icon={<BookOpen size={20} />} label="지식베이스" collapsed />
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                aria-label="지식베이스 메뉴"
                onClick={() => setOnlyMenu('vault')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  vaultMenuOpen ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white dark:text-slate-300'
                }`}
              >
                <BookOpen size={20} />
                <span className="flex-1 text-left">지식베이스</span>
                {vaultMenuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              <div
                className="ml-2 space-y-1 border-l-2 border-slate-700 pl-2 overflow-hidden transition-all duration-300 ease-in-out"
                style={subMenuTransitionStyle(vaultMenuOpen)}
              >
                  <SidebarLink
                    to="/vault/explore"
                    icon={<BookOpen size={18} />}
                    label="탐색"
                    collapsed={false}
                    ariaLabel="지식베이스 탐색"
                  />
                  <SidebarLink
                    to="/vault/ingest"
                    icon={<FilePlus size={18} />}
                    label="추가"
                    collapsed={false}
                    ariaLabel="지식베이스 추가"
                  />
              </div>
            </div>
          )}
          
          {/* Reports Accordion */}
          <div className="space-y-1">
            <button
              onClick={() => setOnlyMenu('report')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                reportMenuOpen ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white dark:text-slate-300'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <FileText size={20} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">보고서</span>
                  {reportMenuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </>
              )}
            </button>
            
            {!collapsed && (
              <div
                className="ml-2 space-y-1 border-l-2 border-slate-700 overflow-hidden transition-all duration-300 ease-in-out"
                style={subMenuTransitionStyle(reportMenuOpen)}
              >
                <SidebarLink to="/report/create" icon={<FilePlus size={18} />} label="보고서 생성" collapsed={false} />
                <SidebarLink to="/report/list" icon={<FileText size={18} />} label="보고서 목록" collapsed={false} />
              </div>
            )}
          </div>
          
          {/* Team Management Accordion */}
          <div className="space-y-1">
            <button
            onClick={() => setOnlyMenu('team')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                teamMenuOpen ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white dark:text-slate-300'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Users size={20} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">팀 관리</span>
                  {teamMenuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </>
              )}
            </button>

            {!collapsed && (
              <div
                className="ml-2 space-y-1 border-l-2 border-slate-700 pl-2 overflow-hidden transition-all duration-300 ease-in-out"
                style={subMenuTransitionStyle(teamMenuOpen)}
              >
                {teamMenuItems.map(item => (
                  <SidebarLink key={item.to} to={item.to} icon={item.icon} label={item.label} collapsed={false} />
                ))}
              </div>
            )}
          </div>

          {/* Work Data Accordion */}
          <div className="space-y-1">
            <button
            onClick={() => setOnlyMenu('workData')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                workDataMenuOpen ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white dark:text-slate-300'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Database size={20} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">업무데이터</span>
                  {workDataMenuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </>
              )}
            </button>

            {!collapsed && (
              <div
                className="ml-2 space-y-1 border-l-2 border-slate-700 overflow-hidden transition-all duration-300 ease-in-out"
                style={subMenuTransitionStyle(workDataMenuOpen)}
              >
                <SidebarLink to="/workdata/gmail" icon={<Mail size={18} />} label="Gmail" collapsed={false} />
                <SidebarLink to="/workdata/calendar" icon={<Calendar size={18} />} label="Google Calendar" collapsed={false} />
              </div>
            )}
          </div>

          {/* Settings Accordion */}
          <div className="space-y-1">
            <button
            onClick={() => setOnlyMenu('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                settingsMenuOpen ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white dark:text-slate-300'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Settings size={20} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">설정</span>
                  {settingsMenuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </>
              )}
            </button>

            {!collapsed && (
              <div
                className="ml-2 space-y-1 border-l-2 border-slate-700 dark:border-slate-600 pl-2 overflow-hidden transition-all duration-300 ease-in-out"
                style={subMenuTransitionStyle(settingsMenuOpen)}
              >
                <SidebarLink to="/settings/team-profile" icon={<Users size={18} />} label="팀 프로필" collapsed={false} />
                <SidebarLink to="/settings/user" icon={<Settings size={18} />} label="사용자 정보" collapsed={false} />
                <SidebarLink to="/settings/attendance" icon={<User size={18} />} label="내 근태 관리" collapsed={false} />
                <SidebarLink to="/settings/template" icon={<FilePlus size={18} />} label="템플릿" collapsed={false} />
                <SidebarLink to="/settings/integrations" icon={<Users size={18} />} label="연동 설정" collapsed={false} />
                <SidebarLink to="/settings/ai-usage" icon={<Bot size={18} />} label="AI 사용량" collapsed={false} />
                {profile?.teamType === 'personal' && (
                  <SidebarLink to="/settings/personal-ai-usage" icon={<Bot size={18} />} label="개인 AI 통합 사용량" collapsed={false} />
                )}
                <SidebarLink to="/settings/categories" icon={<Briefcase size={18} />} label="카테고리" collapsed={false} />
                {profile?.teamType !== 'personal' && (
                  <SidebarLink to="/settings/common-codes" icon={<ListTree size={18} />} label="공통코드관리" collapsed={false} />
                )}
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[var(--color-bg)]">
        <Outlet />
      </main>
    </div>
  )
}

function SidebarLink({
  to,
  icon,
  label,
  collapsed,
  ariaLabel,
}: {
  to: string
  icon: React.ReactNode
  label: string
  collapsed: boolean
  ariaLabel?: string
}) {
  return (
    <NavLink
      to={to}
      aria-label={ariaLabel ?? label}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-blue-600 text-white font-medium'
            : 'text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white dark:text-slate-300'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )
}
