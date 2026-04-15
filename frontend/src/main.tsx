import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import './style.css'
import { TeamProfileProvider } from './contexts/TeamProfileContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import ReportEditor from './pages/ReportEditor'
import ReportCreate from './pages/ReportCreate'
import WeeklyReportList from './pages/WeeklyReportList'
import TeamMembers from './pages/TeamMembers'
import TeamAttendance from './pages/TeamAttendance'
import TeamProjects from './pages/TeamProjects'
import TeamClients from './pages/TeamClients'
import CommonCodes from './pages/CommonCodes'
import Onboarding from './pages/Onboarding'
import FieldIssues from './pages/FieldIssues'
import LinearDashboard from './pages/LinearDashboard'
import TaskBoard from './pages/TaskBoard'
import WeeklyRetro from './pages/WeeklyRetro'
import GmailPage from './pages/GmailPage'
import CalendarPage from './pages/CalendarPage'
import PersonalAttendance from './pages/PersonalAttendance'
import VaultPage from './pages/VaultPage'

const container = document.getElementById('root')
const root = createRoot(container!)

root.render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <TeamProfileProvider>
          <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/report/create" element={<ReportCreate />} />
            <Route path="/report/list" element={<WeeklyReportList />} />
            <Route path="/report/:id" element={<ReportEditor />} />
            <Route path="/team/members" element={<TeamMembers />} />
            <Route path="/team/attendance" element={<TeamAttendance />} />
            <Route path="/team/clients" element={<TeamClients />} />
            <Route path="/team/projects" element={<TeamProjects />} />
            <Route path="/team/issues" element={<FieldIssues />} />
            <Route path="/team/linear" element={<LinearDashboard />} />
            <Route path="/team/taskboard" element={<TaskBoard />} />
            <Route path="/team/retro" element={<WeeklyRetro />} />
            <Route path="/team/common-codes" element={<Navigate to="/settings/common-codes" replace />} />
            <Route path="/workdata/gmail" element={<GmailPage />} />
            <Route path="/workdata/calendar" element={<CalendarPage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/settings" element={<Navigate to="/settings/user" replace />} />
            <Route path="/settings/user" element={<Settings section="user" />} />
            <Route path="/settings/template" element={<Settings section="template" />} />
            <Route path="/settings/integrations" element={<Settings section="integrations" />} />
            <Route path="/settings/categories" element={<Settings section="categories" />} />
            <Route path="/settings/common-codes" element={<CommonCodes />} />
            <Route path="/settings/team-profile" element={<Settings section="team-profile" />} />
            <Route path="/settings/attendance" element={<PersonalAttendance />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </TeamProfileProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>
)
