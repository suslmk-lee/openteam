import { useState, useEffect } from 'react'
import {
  Upload,
  Save,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  FileSpreadsheet,
} from 'lucide-react'
import {
  GetCurrentUser,
  UpdateUser,
  UploadExcelTemplate,
  GetExcelTemplate,
  GetIntegrations,
  SaveIntegration,
  GetProjectCategories,
  AddProjectCategory,
  DeleteProjectCategory,
  CheckGogCLI,
  SetupGogCredentials,
  CheckGmailAuth,
} from '../../wailsjs/go/main/App'

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

type SettingsSection = 'user' | 'template' | 'integrations' | 'categories'

export default function Settings({ section = 'user' }: { section?: SettingsSection }) {
  const [userName, setUserName] = useState('')
  const [userTeam, setUserTeam] = useState('')
  const [template, setTemplate] = useState<ExcelTemplate | null>(null)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  // gogcli / Gmail state
  const [gogInstalled, setGogInstalled] = useState<boolean | null>(null)
  const [gmailAccount, setGmailAccount] = useState('')
  const [gmailAuthOk, setGmailAuthOk] = useState<boolean | null>(null)
  const [gmailAuthMsg, setGmailAuthMsg] = useState('')
  const [openAIApiKey, setOpenAIApiKey] = useState('')
  const [openAIModel, setOpenAIModel] = useState('gpt-4o-mini')
  const [openAIEnabled, setOpenAIEnabled] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const user = await GetCurrentUser()
      if (user) {
        setUserName(user.name)
        setUserTeam(user.team)
      }
      const tmpl = await GetExcelTemplate()
      if (tmpl) setTemplate(tmpl)
      const ints = await GetIntegrations()
      setIntegrations(ints || [])
      const cats = await GetProjectCategories()
      setCategories(cats || [])

      // Check gogcli
      const gogStatus = await CheckGogCLI()
      setGogInstalled(gogStatus.ok)

      // Load existing Gmail account from integration config
      const gmailInt = (ints || []).find((i: Integration) => i.toolType === 'gmail')
      if (gmailInt && gmailInt.configJson) {
        try {
          const config = JSON.parse(gmailInt.configJson)
          if (config.account) {
            setGmailAccount(config.account)
            const authStatus = await CheckGmailAuth(config.account)
            setGmailAuthOk(authStatus.ok)
            setGmailAuthMsg(authStatus.message)
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
    template: 'Excel 템플릿',
    integrations: '협업툴 연동',
    categories: '프로젝트 카테고리',
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800">설정 · {sectionTitle[section]}</h2>
        {saveStatus && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
            <CheckCircle size={16} />
            {saveStatus}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {section === 'user' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
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
          )}

          {section === 'template' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Excel 템플릿</h3>
            {template ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
                <FileSpreadsheet size={20} className="text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">{template.name}</p>
                  <p className="text-xs text-green-600">템플릿이 설정되었습니다</p>
                </div>
                <CheckCircle size={18} className="text-green-600" />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <AlertCircle size={20} className="text-amber-600" />
                <p className="text-sm text-amber-800">
                  Excel 템플릿을 업로드해주세요. 주간업무일지 포맷의 기준이 됩니다.
                </p>
              </div>
            )}
            <button
              onClick={handleUploadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Upload size={16} />
              {template ? '템플릿 변경' : '템플릿 업로드'}
            </button>
          </section>
          )}

          {section === 'integrations' && (
          <>
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-2">OpenAI 보고서 작성</h3>
            <p className="text-xs text-slate-500 mb-4">
              메일 활동을 보고서 문장으로 자동 작성합니다. API Key는 로컬 DB에 저장됩니다.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">OpenAI API Key</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={openAIApiKey}
                  onChange={e => setOpenAIApiKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-600 mb-1">Model</label>
                <input
                  type="text"
                  placeholder="gpt-4o-mini"
                  value={openAIModel}
                  onChange={e => setOpenAIModel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={openAIEnabled}
                  onChange={e => setOpenAIEnabled(e.target.checked)}
                  className="rounded border-slate-300"
                />
                메일 보고서 작성에 OpenAI 사용
              </label>

              <div className="pt-1">
                <button
                  onClick={async () => {
                    try {
                      const configJson = JSON.stringify({
                        apiKey: openAIApiKey.trim(),
                        model: (openAIModel || 'gpt-4o-mini').trim(),
                      })
                      await SaveIntegration('openai', configJson, openAIEnabled)
                      showStatus('OpenAI 설정이 저장되었습니다')
                      const ints = await GetIntegrations()
                      setIntegrations(ints || [])
                    } catch (err) {
                      console.error('Failed to save OpenAI config:', err)
                    }
                  }}
                  className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                >
                  OpenAI 설정 저장
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Google 연동 (gogcli)</h3>
            <p className="text-xs text-slate-500 mb-4">
              Gmail, Google Calendar 데이터를 가져오려면 gogcli 설정이 필요합니다.
            </p>

            {/* Step 1: gogcli 설치 상태 */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  gogInstalled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>1</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">gogcli 설치</p>
                  <p className="text-xs text-slate-500">
                    {gogInstalled === null ? '확인 중...' : gogInstalled ? '✓ 설치됨' : '미설치 — go install github.com/steipete/gogcli/cmd/gog@latest'}
                  </p>
                </div>
                {gogInstalled ? (
                  <CheckCircle size={18} className="text-green-500" />
                ) : (
                  <AlertCircle size={18} className="text-amber-500" />
                )}
              </div>

              {/* Step 2: OAuth Credentials */}
              <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-100 text-slate-500">2</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">OAuth Client 설정</p>
                  <p className="text-xs text-slate-500">
                    Google Cloud Console에서 다운로드한 client_secret JSON 파일
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const result = await SetupGogCredentials()
                      if (result) showStatus('OAuth credentials 저장 완료')
                    } catch (err) {
                      console.error('Credentials setup failed:', err)
                    }
                  }}
                  disabled={!gogInstalled}
                  className="px-3 py-1 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Upload size={14} className="inline mr-1" />
                  JSON 업로드
                </button>
              </div>

              {/* Step 3: Gmail Account */}
              <div className="p-3 border border-slate-100 rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-100 text-slate-500">3</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">Gmail 계정 연동</p>
                    <p className="text-xs text-slate-500">
                      gog auth add 명령으로 인증 후, 계정을 입력하세요
                    </p>
                  </div>
                  {gmailAuthOk && <CheckCircle size={18} className="text-green-500" />}
                </div>
                <div className="flex gap-2 ml-9">
                  <input
                    type="email"
                    placeholder="you@gmail.com"
                    value={gmailAccount}
                    onChange={e => setGmailAccount(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        const authStatus = await CheckGmailAuth(gmailAccount.trim())
                        setGmailAuthOk(authStatus.ok)
                        setGmailAuthMsg(authStatus.message)
                        if (authStatus.ok) {
                          showStatus('Gmail 연동이 설정되었습니다')
                        } else {
                          showStatus('계정 저장됨. 터미널에서 gog auth add ' + gmailAccount.trim() + ' 실행 필요')
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
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">기타 협업툴 연동</h3>
            <div className="space-y-3">
              {TOOL_OPTIONS.filter(t => t.type !== 'gmail' && t.type !== 'google_calendar').map(tool => {
                const enabled = isIntegrationEnabled(tool.type)
                return (
                  <div
                    key={tool.type}
                    className="flex items-center justify-between p-3 border border-slate-100 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{tool.label}</p>
                      <p className="text-xs text-slate-500">{tool.description}</p>
                    </div>
                    <button
                      onClick={() => handleToggleIntegration(tool.type, '{}', !enabled)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        enabled
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
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
        </div>
      </div>
    </div>
  )
}
