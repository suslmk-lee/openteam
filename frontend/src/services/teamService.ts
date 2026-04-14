import { appApi } from './appApi'
import type { db } from '../../wailsjs/go/models'

export const teamService = {
  listTeamMembers: () => appApi.ListTeamMembers(),
  saveTeamMember: (member: db.TeamMember) => appApi.SaveTeamMember(member),
  deleteTeamMember: (id: number) => appApi.DeleteTeamMember(id),
  autoMapLinearMembers: () => appApi.AutoMapLinearMembers(),

  getPositionTypes: () => appApi.GetPositionTypes(),
  addPositionType: (name: string) => appApi.AddPositionType(name),
  getEmploymentTypes: () => appApi.GetEmploymentTypes(),
  addEmploymentType: (name: string) => appApi.AddEmploymentType(name),

  getCurrentWeek: () => appApi.GetCurrentWeek(),
  getWeekByOffset: (offset: number) => appApi.GetWeekByOffset(offset),
  getClientStatuses: () => appApi.GetClientStatuses(),
  getSIWeeklySnapshot: (weekStart: string, weekEnd: string) => appApi.GetSIWeeklySnapshot(weekStart, weekEnd),
  listMemberAssignments: (weekStart: string, weekEnd: string) => appApi.ListMemberAssignments(weekStart, weekEnd),
  listClients: (status: string, activeOnly: boolean) => appApi.ListClients(status, activeOnly),
  listSIProjects: () => appApi.ListSIProjects(),
  saveMemberAssignment: (assignment: db.MemberAssignment) => appApi.SaveMemberAssignment(assignment),
  saveSIProject: (project: db.Project) => appApi.SaveSIProject(project),
  saveClient: (client: db.Client) => appApi.SaveClient(client),
  deleteMemberAssignment: (assignmentID: number) => appApi.DeleteMemberAssignment(assignmentID),
  deleteSIProject: (projectID: number) => appApi.DeleteSIProject(projectID),
  updateSIProjectStatus: (projectID: number, status: string) => appApi.UpdateSIProjectStatus(projectID, status),
  getSIProjectTypes: () => appApi.GetSIProjectTypes(),
  getSIPhases: () => appApi.GetSIPhases(),
  getSIRoles: () => appApi.GetSIRoles(),
  getSIProjectView: (projectID: number, weekStart: string, weekEnd: string) => appApi.GetSIProjectView(projectID, weekStart, weekEnd),
  saveSIProjectDetail: (detail: db.SIProjectDetail) => appApi.SaveSIProjectDetail(detail),
  saveSIWeeklyReport: (report: db.SIWeeklyReport) => appApi.SaveSIWeeklyReport(report),
  saveSIProjectMember: (member: db.SIProjectMember) => appApi.SaveSIProjectMember(member),
  deleteSIProjectMember: (memberID: number) => appApi.DeleteSIProjectMember(memberID),
}
