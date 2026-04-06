import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  UserCog,
  Clock,
  Briefcase,
  FileText,
  FilePlus,
  Building2,
  ListTree,
} from 'lucide-react'
import { useState } from 'react'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [teamMenuOpen, setTeamMenuOpen] = useState(false)
  const [reportMenuOpen, setReportMenuOpen] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } bg-slate-800 text-slate-200 flex flex-col transition-all duration-200 shrink-0`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-slate-700">
          {!collapsed && (
            <h1 className="text-lg font-bold text-white tracking-tight">
              OpenReport
            </h1>
          )}
          {collapsed && (
            <span className="text-lg font-bold text-white mx-auto">OR</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          <SidebarLink to="/" icon={<LayoutDashboard size={20} />} label="대시보드" collapsed={collapsed} />
          
          {/* Reports Accordion */}
          <div className="space-y-1">
            <button
              onClick={() => setReportMenuOpen(!reportMenuOpen)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                reportMenuOpen ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
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
            
            {!collapsed && reportMenuOpen && (
              <div className="ml-2 space-y-1 border-l-2 border-slate-700 pl-2">
                <SidebarLink to="/report/create" icon={<FilePlus size={18} />} label="보고서 생성" collapsed={false} />
                <SidebarLink to="/report/list" icon={<FileText size={18} />} label="보고서 목록" collapsed={false} />
              </div>
            )}
          </div>
          
          {/* Team Management Accordion */}
          <div className="space-y-1">
            <button
              onClick={() => setTeamMenuOpen(!teamMenuOpen)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                teamMenuOpen ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
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
            
            {!collapsed && teamMenuOpen && (
              <div className="ml-2 space-y-1 border-l-2 border-slate-700 pl-2">
                <SidebarLink to="/team/members" icon={<UserCog size={18} />} label="팀원관리" collapsed={false} />
                <SidebarLink to="/team/attendance" icon={<Clock size={18} />} label="근태관리" collapsed={false} />
                <SidebarLink to="/team/clients" icon={<Building2 size={18} />} label="고객사관리" collapsed={false} />
                <SidebarLink to="/team/projects" icon={<Briefcase size={18} />} label="프로젝트관리" collapsed={false} />
              </div>
            )}
          </div>
          
          <div className="space-y-1">
            <button
              onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                settingsMenuOpen ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
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

            {!collapsed && settingsMenuOpen && (
              <div className="ml-2 space-y-1 border-l-2 border-slate-700 pl-2">
                <SidebarLink to="/settings/user" icon={<Settings size={18} />} label="사용자 정보" collapsed={false} />
                <SidebarLink to="/settings/template" icon={<FilePlus size={18} />} label="템플릿" collapsed={false} />
                <SidebarLink to="/settings/integrations" icon={<Users size={18} />} label="연동 설정" collapsed={false} />
                <SidebarLink to="/settings/categories" icon={<Briefcase size={18} />} label="카테고리" collapsed={false} />
                <SidebarLink to="/settings/common-codes" icon={<ListTree size={18} />} label="공통코드관리" collapsed={false} />
              </div>
            )}
          </div>
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-10 flex items-center justify-center border-t border-slate-700 hover:bg-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
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
}: {
  to: string
  icon: React.ReactNode
  label: string
  collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-blue-600 text-white font-medium'
            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )
}
