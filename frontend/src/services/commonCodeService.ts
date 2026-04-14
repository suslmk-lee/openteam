import { appApi } from './appApi'

export type CodeGroupKey = 'position_types' | 'employment_types' | 'project_types' | 'project_phases'

type CodeServiceMethods = {
  load: () => Promise<string[]>
  add: (value: string) => Promise<void>
  remove: (value: string) => Promise<void>
}

const codeServices: Record<CodeGroupKey, CodeServiceMethods> = {
  position_types: {
    load: () => appApi.GetPositionTypes(),
    add: (name) => appApi.AddPositionType(name),
    remove: (name) => appApi.DeletePositionType(name),
  },
  employment_types: {
    load: () => appApi.GetEmploymentTypes(),
    add: (name) => appApi.AddEmploymentType(name),
    remove: (name) => appApi.DeleteEmploymentType(name),
  },
  project_types: {
    load: () => appApi.GetSIProjectTypes(),
    add: (name) => appApi.AddSIProjectType(name),
    remove: (name) => appApi.DeleteSIProjectType(name),
  },
  project_phases: {
    load: () => appApi.GetSIPhases(),
    add: (name) => appApi.AddSIPhase(name),
    remove: (name) => appApi.DeleteSIPhase(name),
  },
}

export const commonCodeService = {
  async load(group: CodeGroupKey): Promise<string[]> {
    const service = codeServices[group]
    const values = await service.load()
    return Array.isArray(values) ? values : []
  },

  async add(group: CodeGroupKey, value: string): Promise<void> {
    const service = codeServices[group]
    await service.add(value.trim())
  },

  async remove(group: CodeGroupKey, value: string): Promise<void> {
    const service = codeServices[group]
    await service.remove(value)
  },
}
