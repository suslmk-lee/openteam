export interface ReportItemForMD {
  id: number
  reportId: number
  section: string
  category: string
  workType: string
  content: string
  period: string
  sortOrder: number
  isSelected: boolean
}

export interface WeekInfoForMD {
  weekStart: string
  weekEnd: string
  label: string
}

const SECTION_LABELS: Record<string, string> = {
  project_progress: '프로젝트 진행사항',
  next_week_plan: '차주 계획',
  issues: '이슈/리스크',
  business_dev: '사업개발/영업',
  attendance: '근태',
  hiring: '인력채용',
  other: '기타',
}

const SECTION_ORDER = [
  'project_progress',
  'next_week_plan',
  'issues',
  'business_dev',
  'attendance',
  'hiring',
  'other',
]

export function generateMarkdown(
  items: ReportItemForMD[],
  teamType: string,
  weekInfo: WeekInfoForMD,
): string {
  const selected = items.filter(i => i.isSelected)
  const header = `# 주간업무보고 | ${weekInfo.weekStart} ~ ${weekInfo.weekEnd}\n\n`

  if (teamType === 'personal') {
    return header + generatePersonalMarkdown(selected)
  }
  return header + generateTeamMarkdown(selected)
}

function generatePersonalMarkdown(items: ReportItemForMD[]): string {
  const thisWeek = items.filter(i => i.period !== 'next_week' && i.section !== 'issues')
  const nextWeek = items.filter(i => i.period === 'next_week')
  const issues = items.filter(i => i.section === 'issues')

  const lines: string[] = []

  lines.push('## 금주 한 일')
  if (thisWeek.length === 0) {
    lines.push('- (없음)')
  } else {
    thisWeek.forEach(item => {
      const tag = item.category ? `[${item.category}] ` : ''
      lines.push(`- ${tag}${item.content}`)
    })
  }

  lines.push('')
  lines.push('## 차주 계획')
  if (nextWeek.length === 0) {
    lines.push('- (없음)')
  } else {
    nextWeek.forEach(item => {
      const tag = item.category ? `[${item.category}] ` : ''
      lines.push(`- ${tag}${item.content}`)
    })
  }

  lines.push('')
  lines.push('## 특이사항')
  if (issues.length === 0) {
    lines.push('- (없음)')
  } else {
    issues.forEach(item => lines.push(`- ${item.content}`))
  }

  return lines.join('\n')
}

function generateTeamMarkdown(items: ReportItemForMD[]): string {
  const bySectionAndCategory = new Map<string, Map<string, string[]>>()

  items.forEach(item => {
    if (!bySectionAndCategory.has(item.section)) {
      bySectionAndCategory.set(item.section, new Map())
    }
    const catMap = bySectionAndCategory.get(item.section)!
    const catKey = item.category || ''
    if (!catMap.has(catKey)) catMap.set(catKey, [])
    catMap.get(catKey)!.push(item.content)
  })

  const lines: string[] = []

  SECTION_ORDER.forEach(section => {
    const catMap = bySectionAndCategory.get(section)
    if (!catMap || catMap.size === 0) return

    lines.push(`## ${SECTION_LABELS[section] || section}`)
    catMap.forEach((contents, cat) => {
      if (cat) lines.push(`### ${cat}`)
      contents.forEach(c => lines.push(`- ${c}`))
    })
    lines.push('')
  })

  return lines.join('\n').trimEnd()
}
