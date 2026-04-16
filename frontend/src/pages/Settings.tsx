import { useState, useEffect } from 'react'
import {
  Upload,
  Save,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  FileSpreadsheet,
  GitBranch,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'
import { useAppApi } from '../hooks/useAppApi'
import AISettingsSection from '../components/settings/AISettingsSection'
import { useTeamProfile } from '../contexts/TeamProfileContext'
import { useTheme } from '../contexts/ThemeContext'

interface Integration {
  id: number
  toolType: string
  configJson: string
  enabled: boolean
}

interface ProjectCategory {
  id: number
  name: string
  sortOrder: number
}

interface ExcelTemplate {
  id: number
  name: string
  structureJson: string
}

const TOOL_OPTIONS = [
  { type: 'naverworks', label: 'NaverWorks', description: '메일, 캘린더, 게시판, 근태, 결재 (향후 연동 예정)' },
  { type: 'linear', label: 'Linear', description: 'GraphQL API' },
  { type: 'gmail', label: 'Gmail', description: 'Google Mail API' },
  { type: 'google_calendar', label: 'Google Calendar', description: '일정 관리' },
  { type: 'kakaotalk', label: '카카오톡', description: '대화 내보내기 파일 업로드' },
  { type: 'slack', label: 'Slack', description: 'Slack Web API' },
  { type: 'github', label: 'GitHub', description: 'REST API' },
  { type: 'jira', label: 'Jira', description: 'REST API' },
]

type SettingsSection = 'user' | 'template' | 'integrations' | 'categories' | 'team-profile'

export default function Settings({ section = 'user' }: { section?: SettingsSection }) {
  const appApi = useAppApi()
  const {
    GetCurrentUser,
    UpdateUser,
    UploadExcelTemplate,
    GetExcelTemplate,
    GetIntegrations,
    SaveIntegration,
    GetProjectCategories,
    AddProjectCategory,
    DeleteProjectCategory,
    CheckGWSCLI,
    SetupGWSAuth,
    CheckGWSAuth,
    GetCalendars,
    UpdateTeamProfile,
    LookupLinearViewer,
    UploadExcelTemplateForType,
    GetExcelTemplateForType,
  } = appApi

  const [userName, setUserName] = useState('')
  const [userTeam, setUserTeam] = useState('')
  const [template, setTemplate] = useState<ExcelTemplate | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [personalTemplate, setPersonalTemplate] = useState<{ name: string } | null>(null)
  const [personalTemplateLoading, setPersonalTemplateLoading] = useState(false)

  // gws / Gmail state
  const [gogInstalled, setGogInstalled] = useState<boolean | null>(null)
  const [gmailAccount, setGmailAccount] = useState('')
  const [gmailAuthOk, setGmailAuthOk] = useState<boolean | null>(null)
  const [gmailAuthMsg, setGmailAuthMsg] = useState('')
  const [openAIApiKey, setOpenAIApiKey] = useState('')
  const [openAIModel, setOpenAIModel] = useState('gpt-4o-mini')
  const [openAIEnabled, setOpenAIEnabled] = useState(false)

  // Google Calendar settings
  const [availableCalendars, setAvailableCalendars] = useState<Array<{id: string, summary: string, primary?: boolean}>>([])
  const [selectedCalendars, setSelectedCalendars] = useState<Array<{id: string, color: string, name?: string}>>([])
  const [loadingCalendars, setLoadingCalendars] = useState(false)

  // Google Calendar style 24-color palette
  const CALENDAR_COLORS = [
    // Row 1: Red/Pink
    { value: '#ac725e', label: '갈색' },
    { value: '#d06b64', label: '진빨강' },
    { value: '#f83a22', label: '빨강' },
    { value: '#fa573c', label: '주황빨강' },
    { value: '#ff7537', label: '주황' },
    { value: '#ffad46', label: '연주황' },
    // Row 2: Yellow/Green
    { value: '#fad165', label: '노랑' },
    { value: '#fbe983', label: '연노랑' },
    { value: '#b3dc6c', label: '연두' },
    { value: '#7bd148', label: '초록' },
    { value: '#16a765', label: '진초록' },
    { value: '#42d692', label: '민트' },
    // Row 3: Cyan/Blue
    { value: '#9fe1e7', label: '하늘' },
    { value: '#92e1c0', label: '청록' },
    { value: '#9fc6e7', label: '연파랑' },
    { value: '#4986e7', label: '파랑' },
    { value: '#9a9cff', label: '보라파랑' },
    { value: '#b99aff', label: '연보라' },
    // Row 4: Purple/Pink/Gray
    { value: '#c2c2c2', label: '회색' },
    { value: '#cabdbf', label: '연회색' },
    { value: '#cca6ac', label: '분홍회색' },
    { value: '#f691b2', label: '분홍' },
    { value: '#cd74e6', label: '진보라' },
    { value: '#a47ae2', label: '보라' },
  ]

  // Linear settings
  const [linearApiKey, setLinearApiKey] = useState('')
  const [linearTeamId, setLinearTeamId] = useState('')
  const [linearUserId, setLinearUserId] = useState('')
  const [linearLookupLoading, setLinearLookupLoading] = useState(false)
  const [linearLookupMessage, setLinearLookupMessage] = useState('')

  // Team profile
  const { profile: teamProfile, reload: reloadProfile } = useTeamProfile()
  const { theme, setTheme } = useTheme()
  const [profileTeamType, setProfileTeamType] = useState('')
  const [profileTeamName, setProfileTeamName] = useState('')
  const [profileUserName, setProfileUserName] = useState('')
  const [profileMemberCount, setProfileMemberCount] = useState(4)
  const [vaultRootPath, setVaultRootPath] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (teamProfile) {
      setProfileTeamType(teamProfile.teamType || '')
      setProfileTeamName(teamProfile.teamName || '')
      setProfileUserName(teamProfile.userName || '')
      setProfileMemberCount(teamProfile.memberCount || 4)
      setLinearApiKey(teamProfile.linearApiKey || '')
      setLinearTeamId(teamProfile.linearTeamId || '')
      setLinearUserId(teamProfile.linearUserId || '')
      setVaultRootPath(teamProfile.vaultRoot || '')

      // Load personal template if user is personal type
      if (teamProfile.teamType === 'personal') {
        GetExcelTemplateForType('personal')
          .then(tmpl => {
            setPersonalTemplate(tmpl ? { name: tmpl.name } : null)
          })
          .catch(err => console.error('Failed to load personal template:', err))
      }
    }
  }, [teamProfile])

  async function loadSettings() {
    try {
      const user = await GetCurrentUser()
      if (user) {
        setUserName(user.name)
        setUserTeam(user.team)
      }
      const tmpl = await GetExcelTemplate()
      if (tmpl) setTemplate(tmpl)

      // Load personal template if user is personal type
      // This will be loaded when teamProfile is available in useEffect

      const ints = await GetIntegrations()
      setIntegrations(ints || [])
      const cats = await GetProjectCategories()
      setCategories(cats || [])

      // Check gws CLI
      const gogStatus = await CheckGWSCLI()
      setGogInstalled(gogStatus.ok)

      // Load existing Gmail account from integration config
      const gmailInt = (ints || []).find((i: Integration) => i.toolType === 'gmail')
      if (gmailInt && gmailInt.configJson) {
        try {
          const config = JSON.parse(gmailInt.configJson)
          if (config.account) {
            setGmailAccount(config.account)
            const authStatus = await CheckGWSAuth()
            setGmailAuthOk(authStatus.ok)
            setGmailAuthMsg(authStatus.message)
          }
        } catch {}
      }

      // Load saved calendar selections from google_calendar integration config
      const calendarInt = (ints || []).find((i: Integration) => i.toolType === 'google_calendar')
      if (calendarInt && calendarInt.configJson) {
        try {
          const config = JSON.parse(calendarInt.configJson)
          if (config.calendars && Array.isArray(config.calendars)) {
            setSelectedCalendars(config.calendars)
          }
        } catch {}
      }

      const openAIInt = (ints || []).find((i: Integration) => i.toolType === 'openai')
      if (openAIInt) {
        setOpenAIEnabled(!!openAIInt.enabled)
        try {
          const config = JSON.parse(openAIInt.configJson || '{}')
          setOpenAIApiKey(config.apiKey || '')
          setOpenAIModel(config.model || 'gpt-4o-mini')
        } catch {
          setOpenAIApiKey('')
          setOpenAIModel('gpt-4o-mini')
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  async function handleSaveUser() {
    try {
      await UpdateUser(userName, userTeam)
      showStatus('사용자 정보가 저장되었습니다')
    } catch (err) {
      console.error('Failed to save user:', err)
    }
  }

  async function handleUploadTemplate() {
    try {
      const result = await UploadExcelTemplate()
      if (result) {
        showStatus('Excel 템플릿이 업로드되었습니다')
        const tmpl = await GetExcelTemplate()
        if (tmpl) setTemplate(tmpl)
      }
    } catch (err) {
      console.error('Failed to upload template:', err)
    }
  }

  async function handleUploadPersonalTemplate() {
    setPersonalTemplateLoading(true)
    try {
      const result = await UploadExcelTemplateForType('personal')
      if (result) {
        const tmpl = await GetExcelTemplateForType('personal')
        setPersonalTemplate(tmpl ? { name: tmpl.name } : null)
        showStatus('개인용 템플릿이 업로드되었습니다')
      }
    } catch (err) {
      console.error('Personal template upload failed:', err)
      showStatus('개인용 템플릿 업로드 실패')
    } finally {
      setPersonalTemplateLoading(false)
    }
  }

  async function handleToggleIntegration(toolType: string, configJson: string, enabled: boolean) {
    try {
      await SaveIntegration(toolType, configJson, enabled)
      showStatus(`${toolType} 연동이 ${enabled ? '활성화' : '비활성화'}되었습니다`)
      const ints = await GetIntegrations()
      setIntegrations(ints || [])
    } catch (err) {
      console.error('Failed to save integration:', err)
    }
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return
    try {
      await AddProjectCategory(newCategory.trim())
      setNewCategory('')
      const cats = await GetProjectCategories()
      setCategories(cats || [])
    } catch (err) {
      console.error('Failed to add category:', err)
    }
  }

  async function handleDeleteCategory(id: number) {
    try {
      await DeleteProjectCategory(id)
      const cats = await GetProjectCategories()
      setCategories(cats || [])
    } catch (err) {
      console.error('Failed to delete category:', err)
    }
  }

  function showStatus(msg: string) {
    setSaveStatus(msg)
    setTimeout(() => setSaveStatus(null), 3000)
  }

  function isIntegrationEnabled(toolType: string): boolean {
    return integrations.some(i => i.toolType === toolType && i.enabled)
  }

  const sectionTitle: Record<SettingsSection, string> = {
    user: '사용자 정보',
    template: '템플릿',
    integrations: '협업툴 연동',
    categories: '프로젝트 카테고리',
    'team-profile': '팀 프로필',
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-[var(--color-bg)]">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[var(--color-card)] flex items-center justify-between px-6 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">설정 · {section === 'integrations' ? '연동 설정' : sectionTitle[section]}</h2>
        {saveStatus && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-emerald-300 bg-green-50 dark:bg-emerald-500/15 px-3 py-1.5 rounded-lg border border-green-200 dark:border-emerald-500/30">
            <CheckCircle size={16} />
            {saveStatus}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {section === 'user' && (
          <>
          <section className="bg-white dark:bg-[var(--color-card)] border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">사용자 정보</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">이름</label>
                <input
                  type="text"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">팀</label>
                <input
                  type="text"
                  value={userTeam}
                  onChange={e => setUserTeam(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={handleSaveUser}
              className="mt-4 flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Save size={16} />
              저장
            </button>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">외관 테마</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg border-2 transition-all ${
                  theme === 'light'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Sun size={18} />
                라이트
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg border-2 transition-all ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Moon size={18} />
                다크
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg border-2 transition-all ${
                  theme === 'system'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Monitor size={18} />
                시스템
              </button>
            </div>
          </section>
          </>
          )}

          {section === 'template' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Excel 템플릿</h3>
            {template ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-emerald-500/15 border border-green-200 dark:border-emerald-500/30 rounded-lg mb-4">
                <FileSpreadsheet size={20} className="text-green-600 dark:text-emerald-300" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-emerald-200">{template.name}</p>
                  <p className="text-xs text-green-600 dark:text-emerald-300">템플릿이 설정되었습니다</p>
                </div>
                <CheckCircle size={18} className="text-green-600 dark:text-emerald-300" />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-lg mb-4">
                <AlertCircle size={20} className="text-amber-600 dark:text-amber-300" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Excel 템플릿을 업로드해주세요. 주간업무일지 포맷의 기준이 됩니다.
                </p>
              </div>
            )}
            <button
              onClick={handleUploadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            >
              <Upload size={16} />
              {template ? '템플릿 변경' : '템플릿 업로드'}
            </button>

            {teamProfile?.teamType === 'personal' && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">개인용 템플릿</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                  개인용 전용 템플릿입니다. 없을 경우 기본 템플릿을 사용합니다.
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">
                    {personalTemplate ? personalTemplate.name : '(업로드 없음 — 기본 템플릿 사용)'}
                  </span>
                  <button
                    onClick={handleUploadPersonalTemplate}
                    disabled={personalTemplateLoading}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {personalTemplateLoading ? '업로드 중...' : '업로드'}
                  </button>
                </div>
              </div>
            )}
          </section>
          )}

          {section === 'integrations' && (
          <>
          <AISettingsSection onSaved={() => showStatus('AI 설정이 저장되었습니다')} />

          <section className="bg-white dark:bg-[var(--color-card)] border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Google 연동 (gws)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Gmail, Google Calendar 데이터를 가져오려면 gws CLI 설정이 필요합니다.
            </p>

            {/* Step 1: gws CLI 설치 상태 */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 border border-slate-100 dark:border-slate-700 rounded-lg">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  gogInstalled ? 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                }`}>1</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">gws CLI 설치</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {gogInstalled === null ? '확인 중...' : gogInstalled ? '✓ 설치됨' : '미설치 — npm install -g @googleworkspace/cli'}
                  </p>
                </div>
                {gogInstalled ? (
                  <CheckCircle size={18} className="text-green-500 dark:text-emerald-300" />
                ) : (
                  <AlertCircle size={18} className="text-amber-500 dark:text-amber-300" />
                )}
              </div>

              {/* Step 2: OAuth Credentials */}
              <div className="flex items-center gap-3 p-3 border border-slate-100 dark:border-slate-700 rounded-lg">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">2</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">OAuth Client 설정</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Google Cloud Console에서 다운로드한 client_secret JSON 파일
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const result = await SetupGWSAuth()
                      if (result) showStatus('OAuth credentials 저장 완료')
                    } catch (err) {
                      console.error('Credentials setup failed:', err)
                    }
                  }}
                  disabled={!gogInstalled}
                  className="px-3 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Upload size={14} className="inline mr-1" />
                  JSON 업로드
                </button>
              </div>

              {/* Step 3: Gmail Account */}
              <div className="p-3 border border-slate-100 dark:border-slate-700 rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">3</div>
                  <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Gmail 계정 연동</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                      터미널에서 'gws auth setup' 실행 후 저장하세요
                    </p>
                  </div>
                  {gmailAuthOk && <CheckCircle size={18} className="text-green-500 dark:text-emerald-300" />}
                </div>
                <div className="flex gap-2 ml-9">
                  <input
                    type="email"
                    placeholder="you@gmail.com"
                    value={gmailAccount}
                    onChange={e => setGmailAccount(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={async () => {
                      if (!gmailAccount.trim()) return
                      try {
                        const configJson = JSON.stringify({ account: gmailAccount.trim() })
                        // Save Gmail integration
                        await SaveIntegration('gmail', configJson, true)
                        // Also save Google Calendar with same account
                        await SaveIntegration('google_calendar', configJson, true)
                        // Check auth
                        const authStatus = await CheckGWSAuth()
                        setGmailAuthOk(authStatus.ok)
                        setGmailAuthMsg(authStatus.message)
                        if (authStatus.ok) {
                          showStatus('Gmail 연동이 설정되었습니다')
                        } else {
                          showStatus('계정 저장됨. 터미널에서 gws auth login 실행 필요')
                        }
                        const ints = await GetIntegrations()
                        setIntegrations(ints || [])
                      } catch (err) {
                        console.error('Gmail setup failed:', err)
                      }
                    }}
                    disabled={!gogInstalled || !gmailAccount.trim()}
                    className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    저장
                  </button>
                </div>
                {gmailAuthMsg && (
                  <p className={`ml-9 text-xs ${gmailAuthOk ? 'text-green-600' : 'text-amber-600'}`}>
                    {gmailAuthMsg}
                  </p>
                )}
              </div>

              {/* Step 4: Google Calendar Selection */}
              <div className="p-3 border border-slate-100 dark:border-slate-700 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">4</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Google Calendar 선택</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        여러 캘린더를 선택하고 색상을 지정하세요
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!gmailAccount.trim()) {
                        setGmailAuthMsg('먼저 Gmail 계정을 설정해주세요')
                        return
                      }
                      setLoadingCalendars(true)
                      try {
                        const calendars = await GetCalendars()
                        setAvailableCalendars(calendars || [])
                        // Merge with existing selections - preserve calendars that still exist
                        const existingIds = new Set(calendars?.map((c: any) => c.id) || [])
                        const preservedSelections = selectedCalendars.filter(sc => existingIds.has(sc.id))
                        // Auto-select primary only if no existing selections
                        const primary = calendars?.find((c: any) => c.primary)
                        if (primary && preservedSelections.length === 0) {
                          setSelectedCalendars([{ id: primary.id, color: CALENDAR_COLORS[0].value, name: primary.summary }])
                        } else {
                          setSelectedCalendars(preservedSelections)
                        }
                      } catch (err) {
                        console.error('Failed to load calendars:', err)
                        setGmailAuthMsg('캘린더 목록을 불러올 수 없습니다')
                      } finally {
                        setLoadingCalendars(false)
                      }
                    }}
                    disabled={!gmailAuthOk || loadingCalendars}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingCalendars ? '불러오는 중...' : '캘린더 목록'}
                  </button>
                </div>

                {/* Calendar List with Checkboxes and Color Pickers */}
                {availableCalendars.length > 0 && (
                  <div className="ml-9 space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">캘린더를 선택하고 색상을 지정하세요:</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                      {availableCalendars.map((cal) => {
                        const isSelected = selectedCalendars.some(sc => sc.id === cal.id)
                        const selectedCal = selectedCalendars.find(sc => sc.id === cal.id)
                        return (
                          <div key={cal.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  // Assign next available color
                                  const usedColors = selectedCalendars.map(sc => sc.color)
                                  const availableColor = CALENDAR_COLORS.find(c => !usedColors.includes(c.value))
                                  const color = availableColor?.value || CALENDAR_COLORS[0].value
                                  const newCalendar = { id: cal.id, color, name: cal.summary }
                                  const updatedCalendars = [...selectedCalendars, newCalendar]
                                  setSelectedCalendars(updatedCalendars)
                                  // Save immediately with updated array
                                  const configJson = JSON.stringify({
                                    account: gmailAccount.trim(),
                                    calendars: updatedCalendars
                                  })
                                  SaveIntegration('google_calendar', configJson, true)
                                } else {
                                  const updatedCalendars = selectedCalendars.filter(sc => sc.id !== cal.id)
                                  setSelectedCalendars(updatedCalendars)
                                  // Save immediately with updated array
                                  const configJson = JSON.stringify({
                                    account: gmailAccount.trim(),
                                    calendars: updatedCalendars
                                  })
                                  SaveIntegration('google_calendar', configJson, true)
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                              {cal.summary}
                              {cal.primary && <span className="ml-2 text-xs text-blue-600">(기본)</span>}
                            </span>
                            {isSelected && (
                              <span 
                                className="w-4 h-4 rounded-full shrink-0"
                                style={{ backgroundColor: selectedCal?.color || CALENDAR_COLORS[0].value }}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {selectedCalendars.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-300">
                        최소 하나의 캘린더를 선택해주세요
                      </p>
                    )}
                  </div>
                )}

                {availableCalendars.length === 0 && gmailAuthOk && !loadingCalendars && (
                   <p className="ml-9 text-xs text-slate-500 dark:text-slate-400">
                    "캘린더 목록" 버튼을 클릭하여 사용 가능한 캘린더를 불러오세요
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-[var(--color-card)] border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">기타 협업툴 연동</h3>
            <div className="space-y-3">
              {TOOL_OPTIONS.filter(t => t.type !== 'gmail' && t.type !== 'google_calendar').map(tool => {
                const enabled = isIntegrationEnabled(tool.type)
                return (
                  <div
                    key={tool.type}
                      className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-700 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{tool.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{tool.description}</p>
                    </div>
                    <button
                      onClick={() => handleToggleIntegration(tool.type, '{}', !enabled)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        enabled
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      }`}
                    >
                      {enabled ? '연동 중' : '연동하기'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
          </>
          )}

          {section === 'categories' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">프로젝트 카테고리</h3>
            <p className="text-xs text-slate-500 mb-3">
              주간업무일지에 사용할 프로젝트/업무 카테고리를 관리합니다
            </p>
            <div className="space-y-2 mb-4">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg"
                >
                  <span className="text-sm text-slate-700">{cat.name}</span>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-slate-400 py-2">등록된 카테고리가 없습니다</p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="새 카테고리 이름"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddCategory}
                disabled={!newCategory.trim()}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <Plus size={16} />
                추가
              </button>
            </div>
          </section>
          )}

          {/* Linear Settings (shown in integrations section) */}
          {section === 'integrations' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <GitBranch size={18} className="text-violet-500" />
              <h3 className="text-base font-semibold text-slate-800">Linear 연동</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              현장 SI팀·소규모팀에서 Linear 이슈/태스크를 읽기 전용으로 표시합니다. API Key는 로컬 DB에 저장됩니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Linear API Key</label>
                <input
                  type="password"
                  placeholder="lin_api_..."
                  value={linearApiKey}
                  onChange={e => setLinearApiKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Linear &gt; Settings &gt; API &gt; Personal API Keys</p>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Team ID (선택)</label>
                <input
                  type="text"
                  placeholder="팀 ID (비워두면 개인 이슈만 표시)"
                  value={linearTeamId}
                  onChange={e => setLinearTeamId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Linear &gt; Settings &gt; Teams &gt; Team URL의 마지막 부분</p>
              </div>
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">Linear User ID (개인 모드 필수)</label>
                <input
                  type="text"
                  placeholder="예: 6f2b3c1a-...."
                  value={linearUserId}
                  onChange={e => setLinearUserId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const key = linearApiKey.trim()
                      if (!key) {
                        setLinearLookupMessage('먼저 Linear API Key를 입력해 주세요.')
                        return
                      }
                      try {
                        setLinearLookupLoading(true)
                        setLinearLookupMessage('')
                        const viewer = await LookupLinearViewer(key)
                        const id = (viewer?.id || '').trim()
                        if (!id) {
                          setLinearLookupMessage('조회된 User ID가 없습니다. API Key 권한을 확인해 주세요.')
                          return
                        }
                        setLinearUserId(id)
                        const meta = [viewer?.name, viewer?.email].filter(Boolean).join(' / ')
                        setLinearLookupMessage(meta ? `조회 완료: ${meta}` : '조회 완료')
                      } catch (err) {
                        console.error('Failed to lookup Linear viewer:', err)
                        setLinearLookupMessage('User ID 자동 조회에 실패했습니다. API Key를 확인해 주세요.')
                      } finally {
                        setLinearLookupLoading(false)
                      }
                    }}
                    disabled={linearLookupLoading}
                    className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {linearLookupLoading ? '조회 중...' : '내 ID 자동 조회'}
                  </button>
                </div>
                {linearLookupMessage && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{linearLookupMessage}</p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">개인 모드에서 태스크보드 담당자 자동지정을 위해 사용됩니다.</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    if (!teamProfile) return
                    await UpdateTeamProfile({
                      ...teamProfile,
                      linearApiKey: linearApiKey.trim(),
                      linearTeamId: linearTeamId.trim(),
                      linearUserId: linearUserId.trim(),
                    } as any)
                    await reloadProfile()
                    showStatus('Linear 설정이 저장되었습니다')
                  } catch (err) {
                    console.error('Failed to save Linear config:', err)
                  }
                }}
                className="px-4 py-2 text-sm bg-violet-600 text-white hover:bg-violet-700 rounded-lg transition-colors"
              >
                Linear 설정 저장
              </button>
            </div>
          </section>
          )}

          {section === 'integrations' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-2">지식베이스</h3>
            <p className="text-xs text-slate-500 mb-4">지식베이스 경로는 Linear 연동 설정과 분리되어 관리됩니다.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vault Root Path</label>
                <input
                  type="text"
                  value={vaultRootPath}
                  onChange={e => setVaultRootPath(e.target.value)}
                  placeholder="D:\\Vault"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">비워두면 기본 경로를 사용합니다.</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    if (!teamProfile) return
                    await UpdateTeamProfile({
                      ...teamProfile,
                      vaultRoot: vaultRootPath.trim(),
                    } as any)
                    await reloadProfile()
                    showStatus('지식베이스 설정이 저장되었습니다')
                  } catch (err) {
                    console.error('Failed to save vault root path:', err)
                  }
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                지식베이스 설정 저장
              </button>
            </div>
          </section>
          )}

          {/* Team Profile section */}
          {section === 'team-profile' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">팀 프로필 관리</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">팀 유형</label>
                <select
                  value={profileTeamType}
                  onChange={e => setProfileTeamType(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="personal">개인 (Personal)</option>
                  <option value="si_business">SI 사업팀</option>
                  <option value="si_field">현장 SI팀 (PM/PL)</option>
                  <option value="small_team">소규모팀 (3~4인)</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">팀 유형을 변경하면 사이드바 메뉴와 대시보드가 전환됩니다. 기존 데이터는 유지됩니다.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">팀 이름</label>
                <input
                  type="text"
                  value={profileTeamName}
                  onChange={e => setProfileTeamName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">팀장 이름</label>
                <input
                  type="text"
                  value={profileUserName}
                  onChange={e => setProfileUserName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">팀 인원수</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={profileMemberCount}
                    onChange={e => setProfileMemberCount(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-semibold text-slate-700 bg-slate-100 rounded-lg py-1 text-sm">{profileMemberCount}명</span>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    if (!teamProfile) return
                    await UpdateTeamProfile({
                      ...teamProfile,
                      teamType: profileTeamType,
                      teamName: profileTeamName,
                      userName: profileUserName,
                      memberCount: profileMemberCount,
                    } as any)
                    await reloadProfile()
                    showStatus('팀 프로필이 저장되었습니다')
                  } catch (err) {
                    console.error('Failed to save team profile:', err)
                  }
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                팀 프로필 저장
              </button>
            </div>
          </section>
          )}
        </div>
      </div>
    </div>
  )
}
