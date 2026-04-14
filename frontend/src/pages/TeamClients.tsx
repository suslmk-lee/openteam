import { useEffect, useState } from 'react'
import { useAppApi } from '../hooks/useAppApi'
import { Plus, X, Building2, Mail, User, Edit3, Trash2 } from 'lucide-react'
import type { db } from '../../wailsjs/go/models'

interface Client extends db.Client {
  id: number
  name: string
  status: string
  ownerName: string
  contactEmail: string
  notes: string
  active: boolean
}

const STATUS_LABELS: Record<string, string> = {
  existing: '기존',
  target: '신규',
  inactive: '종료',
}

const STATUS_COLORS: Record<string, string> = {
  existing: 'bg-blue-100 text-blue-700',
  target: 'bg-amber-100 text-amber-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export default function TeamClients() {
  const appApi = useAppApi()
  const { GetClientStatuses, ListClients, SaveClient, DeleteClient } = appApi

  const [clients, setClients] = useState<Client[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [status, setStatus] = useState('existing')
  const [ownerName, setOwnerName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)

  useEffect(() => {
    loadData()
    GetClientStatuses().then(setStatuses)
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const data = await ListClients('', false)
      setClients((data || []) as Client[])
    } finally {
      setLoading(false)
    }
  }

  function openModal(client?: Client) {
    if (client) {
      setEditingClient(client)
      setName(client.name)
      setStatus(client.status)
      setOwnerName(client.ownerName || '')
      setContactEmail(client.contactEmail || '')
      setNotes(client.notes || '')
      setActive(client.active)
    } else {
      setEditingClient(null)
      setName('')
      setStatus(statuses[0] || 'existing')
      setOwnerName('')
      setContactEmail('')
      setNotes('')
      setActive(true)
    }
    setShowModal(true)
  }

  async function handleSave() {
    if (!name.trim()) return
    await SaveClient({
      id: editingClient?.id || 0,
      name: name.trim(),
      status,
      ownerName: ownerName.trim(),
      contactEmail: contactEmail.trim(),
      notes: notes.trim(),
      active,
    } as any)
    setShowModal(false)
    await loadData()
  }

  async function handleDelete(client: Client) {
    if (!confirm(`${client.name} 고객사를 삭제하시겠습니까?`)) return
    await DeleteClient(client.id)
    await loadData()
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">고객사 관리</h2>
          <p className="text-xs text-slate-500">고객사 등록 및 관리</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            {loading ? '로딩 중...' : '새로고침'}
          </button>
          <button
            onClick={() => openModal()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
          >
            <Plus size={16} />
            고객사 추가
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Summary Cards */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">전체 고객사</p>
              <p className="text-2xl font-semibold text-slate-800">{clients.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">기존 고객사</p>
              <p className="text-2xl font-semibold text-blue-600">
                {clients.filter(c => c.status === 'existing').length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">신규 고객사</p>
              <p className="text-2xl font-semibold text-amber-600">
                {clients.filter(c => c.status === 'target').length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">활성 고객사</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {clients.filter(c => c.active).length}
              </p>
            </div>
          </section>

          {/* Clients Table */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">고객사 목록</h3>
            </div>
            {clients.length === 0 ? (
              <div className="p-8 text-center">
                <Building2 className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">등록된 고객사가 없습니다.</p>
                <button
                  onClick={() => openModal()}
                  className="mt-3 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  고객사 등록하기
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">고객사명</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">상태</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">담당자</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">연띝처</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">활성</th>
                      <th className="text-right py-3 px-4 text-slate-600 font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(client => (
                      <tr key={client.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Building2 size={16} className="text-slate-400" />
                            <span className="font-medium text-slate-800">{client.name}</span>
                          </div>
                          {client.notes && (
                            <p className="text-xs text-slate-400 mt-1 ml-6">{client.notes}</p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[client.status] || 'bg-slate-100'}`}>
                            {STATUS_LABELS[client.status] || client.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {client.ownerName ? (
                            <div className="flex items-center gap-1 text-slate-600">
                              <User size={14} />
                              <span>{client.ownerName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {client.contactEmail ? (
                            <div className="flex items-center gap-1 text-slate-600">
                              <Mail size={14} />
                              <span className="text-xs">{client.contactEmail}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-1 rounded-full ${client.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {client.active ? '활성' : '비활성'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openModal(client)}
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="수정"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(client)}
                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="삭제"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingClient ? '고객사 수정' : '신규 고객사 등록'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">고객사명 *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="예: 삼성전자"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">상태</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  {statuses.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">주요 담당자</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  placeholder="예: 홍길동 과장"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">연락처 이메일</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="example@company.com"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">비고</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="추가 정보..."
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                활성 고객사
              </label>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim()}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
