import { useEffect, useState } from 'react'
import { useAppApi } from '../../hooks/useAppApi'
import type { AIProviderConfig, AIProviderID, AISettings } from '../../services/appApi'

interface AISettingsSectionProps {
  onSaved?: () => void
}

const PROVIDERS: Array<{ id: AIProviderID; label: string; supportsAPI: boolean }> = [
  { id: 'openai', label: 'OpenAI', supportsAPI: true },
  { id: 'minimax', label: 'MiniMax', supportsAPI: true },
  { id: 'claude_cli', label: 'Claude CLI', supportsAPI: false },
]

const MODEL_OPTIONS: Record<AIProviderID, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
  minimax: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1'],
  claude_cli: ['claude-sonnet-4', 'claude-opus-4.1'],
}

function defaultSettings(): AISettings {
  return {
    defaultProvider: 'openai',
    policy: {
      chatAllowOverride: true,
    },
    providers: {
      openai: {
        enabled: false,
        apiKey: '',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
        mode: 'openai_compatible',
      },
      minimax: {
        enabled: false,
        apiKey: '',
        model: 'MiniMax-M2.7',
        baseUrl: 'https://api.minimax.io/v1',
        mode: 'openai_compatible',
      },
      claude_cli: {
        enabled: false,
        apiKey: '',
        model: '',
        baseUrl: '',
        mode: 'local_cli',
      },
    },
  }
}

function normalizeSettings(input: AISettings): AISettings {
  const defaults = defaultSettings()
  const providers: Record<string, AIProviderConfig> = { ...defaults.providers, ...(input.providers ?? {}) }
  return {
    defaultProvider: input.defaultProvider || defaults.defaultProvider,
    policy: {
      chatAllowOverride: input.policy?.chatAllowOverride ?? defaults.policy.chatAllowOverride,
    },
    providers: {
      openai: {
        ...providers.openai,
        mode: providers.openai?.mode || 'openai_compatible',
      },
      minimax: {
        ...providers.minimax,
        mode: providers.minimax?.mode || 'openai_compatible',
      },
      claude_cli: {
        ...providers.claude_cli,
        mode: providers.claude_cli?.mode || 'local_cli',
      },
    },
  }
}

function modelOptions(provider: AIProviderID, currentModel: string): string[] {
  const base = MODEL_OPTIONS[provider]
  const current = currentModel.trim()
  if (!current) return base
  if (base.includes(current)) return base
  return [current, ...base]
}

function fallbackProvider(settings: AISettings): AIProviderID {
  if (settings.providers.openai?.enabled) return 'openai'
  if (settings.providers.minimax?.enabled) return 'minimax'
  return 'openai'
}

function sanitizeForClaudeUnavailable(settings: AISettings): AISettings {
  const next: AISettings = {
    ...settings,
    providers: {
      ...settings.providers,
      claude_cli: {
        ...(settings.providers.claude_cli ?? {}),
        enabled: false,
      },
    },
  }

  if (next.defaultProvider === 'claude_cli') {
    next.defaultProvider = fallbackProvider(next)
  }

  return next
}

export default function AISettingsSection({ onSaved }: AISettingsSectionProps) {
  const { GetAISettings, SaveAISettings, CheckClaudeCLI } = useAppApi()
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [claudeAvailable, setClaudeAvailable] = useState(false)
  const [claudeVersion, setClaudeVersion] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [settingsResult, claudeResult] = await Promise.all([
          GetAISettings(),
          CheckClaudeCLI().catch(() => ({ ok: false, version: '' })),
        ])

        if (cancelled) return

        const claudeOk = Boolean(claudeResult?.ok)
        const normalized = normalizeSettings(settingsResult)
        const finalSettings = claudeOk ? normalized : sanitizeForClaudeUnavailable(normalized)

        setClaudeAvailable(claudeOk)
        setClaudeVersion((claudeResult?.version || '').trim())
        setSettings(finalSettings)
      } catch (loadError: any) {
        if (!cancelled) {
          setSettings(defaultSettings())
          setError(loadError?.message ?? 'AI 설정을 불러오지 못했습니다')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [CheckClaudeCLI, GetAISettings])

  function updateProvider(id: AIProviderID, patch: Partial<AIProviderConfig>) {
    setSettings(current => {
      if (!current) return current

      const nextPatch =
        !claudeAvailable && id === 'claude_cli'
          ? { ...patch, enabled: false }
          : patch

      const nextSettings: AISettings = {
        ...current,
        providers: {
          ...current.providers,
          [id]: {
            ...current.providers[id],
            ...nextPatch,
          },
        },
      }

      if (!claudeAvailable && nextSettings.defaultProvider === 'claude_cli') {
        nextSettings.defaultProvider = fallbackProvider(nextSettings)
      }

      return nextSettings
    })
  }

  async function handleSave() {
    if (!settings || saving) return
    setSaving(true)
    setError('')
    try {
      const payload = claudeAvailable ? settings : sanitizeForClaudeUnavailable(settings)
      await SaveAISettings(payload)
      setSettings(payload)
      onSaved?.()
    } catch (saveError: any) {
      setError(saveError?.message ?? 'AI 설정 저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white dark:bg-[var(--color-card)] border border-slate-200 dark:border-slate-700 rounded-xl p-6">
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">AI 전역 설정</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        앱에서 공통으로 사용할 AI 제공자와 모델을 설정합니다. 채팅에서는 세션별 오버라이드가 가능합니다.
      </p>

      {!loading && !claudeAvailable && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          현재 환경에서는 Claude Code CLI를 사용할 수 없습니다. Claude 관련 설정은 비활성화됩니다.
        </div>
      )}

      {!loading && claudeAvailable && claudeVersion && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          Claude Code CLI 사용 가능: {claudeVersion}
        </div>
      )}

      {loading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">AI 설정을 불러오는 중...</p>
      )}

      {!loading && settings && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <label className="text-sm text-slate-600 dark:text-slate-300 self-center">기본 제공자</label>
            <select
              aria-label="기본 제공자"
              value={settings.defaultProvider}
              onChange={event => {
                const nextProvider = event.target.value as AIProviderID
                if (!claudeAvailable && nextProvider === 'claude_cli') return
                setSettings(prev => prev ? { ...prev, defaultProvider: nextProvider } : prev)
              }}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
            >
              {PROVIDERS.map(provider => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={!claudeAvailable && provider.id === 'claude_cli'}
                >
                  {provider.label}{!claudeAvailable && provider.id === 'claude_cli' ? ' (사용 불가)' : ''}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              aria-label="채팅 오버라이드 허용"
              type="checkbox"
              checked={settings.policy.chatAllowOverride}
              onChange={event =>
                setSettings(prev => prev ? {
                  ...prev,
                  policy: { ...prev.policy, chatAllowOverride: event.target.checked },
                } : prev)
              }
            />
            채팅 오버라이드 허용 (제공자/모델)
          </label>

          {PROVIDERS.map(provider => {
            const config = settings.providers[provider.id] ?? {}
            const providerModelOptions = modelOptions(provider.id, config.model || '')
            const isClaudeUnavailable = provider.id === 'claude_cli' && !claudeAvailable

            return (
              <div key={provider.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(config.enabled) && !isClaudeUnavailable}
                    disabled={isClaudeUnavailable}
                    onChange={event => updateProvider(provider.id, { enabled: event.target.checked })}
                  />
                  {provider.label} 사용
                </label>

                {provider.supportsAPI && (
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{provider.label} API 키</label>
                    <input
                      type="password"
                      value={config.apiKey || ''}
                      onChange={event => updateProvider(provider.id, { apiKey: event.target.value })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{provider.label} 모델</label>
                  <select
                    aria-label={`${provider.label} 모델`}
                    value={config.model || ''}
                    disabled={isClaudeUnavailable}
                    onChange={event => updateProvider(provider.id, { model: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm disabled:opacity-60"
                  >
                    <option value="">모델 선택</option>
                    {providerModelOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                {provider.supportsAPI && (
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{provider.label} 기본 URL</label>
                    <input
                      type="text"
                      value={config.baseUrl || ''}
                      onChange={event => updateProvider(provider.id, { baseUrl: event.target.value })}
                      placeholder="https://api.example.com/v1"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            )
          })}

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
          )}

          <button
            type="button"
            aria-label="AI 설정 저장"
            onClick={() => { void handleSave() }}
            disabled={saving}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? '저장 중...' : 'AI 설정 저장'}
          </button>
        </div>
      )}
    </section>
  )
}
