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
      const contentLines = item.content.split('\n').filter(line => line.trim())
      if (contentLines.length > 0) {
        // Check if content is already formatted (starts with "1) 진행업무:" or similar)
        if (contentLines[0].match(/^\d+\)/)) {
          // Already formatted - output as-is without category tag (content is self-contained)
          lines.push(contentLines[0])
          for (let i = 1; i < contentLines.length; i++) {
            lines.push(contentLines[i])
          }
        } else {
          // Not formatted - use markdown list with category tag
          lines.push(`- ${tag}${contentLines[0]}`)
          for (let i = 1; i < contentLines.length; i++) {
            lines.push(`  ${contentLines[i]}`)
          }
        }
      }
    })
  }

  lines.push('')
  lines.push('## 차주 계획')
  if (nextWeek.length === 0) {
    lines.push('- (없음)')
  } else {
    nextWeek.forEach(item => {
      const tag = item.category ? `[${item.category}] ` : ''
      const contentLines = item.content.split('\n').filter(line => line.trim())
      if (contentLines.length > 0) {
        // Check if content is already formatted (starts with "1) 진행업무:" or similar)
        if (contentLines[0].match(/^\d+\)/)) {
          // Already formatted - output as-is without category tag (content is self-contained)
          lines.push(contentLines[0])
          for (let i = 1; i < contentLines.length; i++) {
            lines.push(contentLines[i])
          }
        } else {
          // Not formatted - use markdown list with category tag
          lines.push(`- ${tag}${contentLines[0]}`)
          for (let i = 1; i < contentLines.length; i++) {
            lines.push(`  ${contentLines[i]}`)
          }
        }
      }
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
      // Only show category as sub-header if content is NOT already formatted
      const hasFormattedContent = contents.some(c => c.match(/^\d+\)/))
      if (cat && !hasFormattedContent) lines.push(`### ${cat}`)

      contents.forEach(c => {
        // Check if content is already formatted (starts with "1) 진행업무:" or similar)
        if (c.match(/^\d+\)/)) {
          // Already formatted - output as-is without category wrapper
          lines.push(c)
        } else {
          // Not formatted - use markdown list
          lines.push(`- ${c}`)
        }
      })
    })
    lines.push('')
  })

  return lines.join('\n').trimEnd()
}
