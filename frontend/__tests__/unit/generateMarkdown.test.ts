import { describe, it, expect } from 'vitest'
import { generateMarkdown } from '../../src/utils/generateMarkdown'

const weekInfo = { weekStart: '2026-04-07', weekEnd: '2026-04-11', label: '2026년 15주차' }

const makeItem = (overrides: Partial<Parameters<typeof generateMarkdown>[0][0]>) => ({
  id: 1,
  reportId: 1,
  section: 'project_progress',
  category: '',
  workType: '',
  content: '기본 업무 내용',
  period: 'this_week',
  sortOrder: 0,
  isSelected: true,
  ...overrides,
})

describe('generateMarkdown — personal', () => {
  it('제목에 주간 날짜 범위가 포함된다', () => {
    const md = generateMarkdown([], 'personal', weekInfo)
    expect(md).toContain('2026-04-07 ~ 2026-04-11')
  })

  it('this_week + non-issues 항목은 금주 한 일에 들어간다', () => {
    const items = [makeItem({ content: '로그인 기능 구현', period: 'this_week', section: 'project_progress' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('## 금주 한 일')
    expect(md).toContain('로그인 기능 구현')
  })

  it('next_week 항목은 차주 계획에 들어간다', () => {
    const items = [makeItem({ content: '대시보드 UI 작업', period: 'next_week' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('## 차주 계획')
    expect(md).toContain('대시보드 UI 작업')
  })

  it('issues 섹션 항목은 특이사항에 들어간다', () => {
    const items = [makeItem({ section: 'issues', content: '배포 서버 장애', period: 'this_week' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('## 특이사항')
    expect(md).toContain('배포 서버 장애')
  })

  it('특이사항 항목이 없으면 (없음)을 표시한다', () => {
    const md = generateMarkdown([], 'personal', weekInfo)
    expect(md).toContain('(없음)')
  })

  it('isSelected=false 항목은 제외된다', () => {
    const items = [makeItem({ content: '제외될 항목', isSelected: false })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).not.toContain('제외될 항목')
  })

  it('category가 있으면 [category] 태그를 붙인다', () => {
    const items = [makeItem({ content: '기능 개발', category: 'OpenReport' })]
    const md = generateMarkdown(items, 'personal', weekInfo)
    expect(md).toContain('[OpenReport] 기능 개발')
  })
})

describe('generateMarkdown — team (si_business)', () => {
  it('SECTIONS 순서대로 섹션 헤더가 렌더링된다', () => {
    const items = [
      makeItem({ section: 'project_progress', content: '진행 업무' }),
      makeItem({ section: 'issues', content: '이슈 내용', period: 'this_week' }),
    ]
    const md = generateMarkdown(items, 'si_business', weekInfo)
    const progressIdx = md.indexOf('## 프로젝트 진행사항')
    const issueIdx = md.indexOf('## 이슈/리스크')
    expect(progressIdx).toBeGreaterThan(-1)
    expect(issueIdx).toBeGreaterThan(progressIdx)
  })

  it('항목이 없는 섹션은 출력하지 않는다', () => {
    const items = [makeItem({ section: 'project_progress', content: '진행 업무' })]
    const md = generateMarkdown(items, 'si_business', weekInfo)
    expect(md).not.toContain('## 이슈/리스크')
  })
})
