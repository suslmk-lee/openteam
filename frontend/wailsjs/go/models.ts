export namespace db {
	
	export class Activity {
	    id: number;
	    integrationId: number;
	    source: string;
	    externalId: string;
	    title: string;
	    summary: string;
	    rawData: string;
	    activityDate: string;
	    // Go type: time
	    fetchedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Activity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.integrationId = source["integrationId"];
	        this.source = source["source"];
	        this.externalId = source["externalId"];
	        this.title = source["title"];
	        this.summary = source["summary"];
	        this.rawData = source["rawData"];
	        this.activityDate = source["activityDate"];
	        this.fetchedAt = this.convertValues(source["fetchedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AttendanceRecord {
	    id: number;
	    userId: number;
	    teamMemberId: number;
	    recordDate: string;
	    type: string;
	    checkInTime?: string;
	    checkOutTime?: string;
	    notes: string;
	    integrationSource: string;
	    externalId: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new AttendanceRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.teamMemberId = source["teamMemberId"];
	        this.recordDate = source["recordDate"];
	        this.type = source["type"];
	        this.checkInTime = source["checkInTime"];
	        this.checkOutTime = source["checkOutTime"];
	        this.notes = source["notes"];
	        this.integrationSource = source["integrationSource"];
	        this.externalId = source["externalId"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AttendanceSummary {
	    teamMemberId: number;
	    teamMemberName: string;
	    vacationDays: number;
	    morningHalfDays: number;
	    afternoonHalfDays: number;
	    totalDays: number;
	
	    static createFrom(source: any = {}) {
	        return new AttendanceSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.teamMemberId = source["teamMemberId"];
	        this.teamMemberName = source["teamMemberName"];
	        this.vacationDays = source["vacationDays"];
	        this.morningHalfDays = source["morningHalfDays"];
	        this.afternoonHalfDays = source["afternoonHalfDays"];
	        this.totalDays = source["totalDays"];
	    }
	}
	export class Client {
	    id: number;
	    userId: number;
	    name: string;
	    status: string;
	    ownerName: string;
	    contactEmail: string;
	    notes: string;
	    active: boolean;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Client(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.ownerName = source["ownerName"];
	        this.contactEmail = source["contactEmail"];
	        this.notes = source["notes"];
	        this.active = source["active"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExcelTemplate {
	    id: number;
	    userId: number;
	    name: string;
	    filePath: string;
	    structureJson: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ExcelTemplate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.name = source["name"];
	        this.filePath = source["filePath"];
	        this.structureJson = source["structureJson"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Integration {
	    id: number;
	    userId: number;
	    toolType: string;
	    configJson: string;
	    enabled: boolean;
	    // Go type: time
	    lastSyncedAt?: any;
	
	    static createFrom(source: any = {}) {
	        return new Integration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.toolType = source["toolType"];
	        this.configJson = source["configJson"];
	        this.enabled = source["enabled"];
	        this.lastSyncedAt = this.convertValues(source["lastSyncedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MemberAssignment {
	    id: number;
	    userId: number;
	    teamMemberId: number;
	    projectId: number;
	    allocationPercent: number;
	    startDate: string;
	    endDate?: string;
	    workMode: string;
	    notes: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new MemberAssignment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.teamMemberId = source["teamMemberId"];
	        this.projectId = source["projectId"];
	        this.allocationPercent = source["allocationPercent"];
	        this.startDate = source["startDate"];
	        this.endDate = source["endDate"];
	        this.workMode = source["workMode"];
	        this.notes = source["notes"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Project {
	    id: number;
	    userId: number;
	    teamType: string;
	    clientId: number;
	    name: string;
	    clientName: string;
	    status: string;
	    description: string;
	    startDate: string;
	    endDate?: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.teamType = source["teamType"];
	        this.clientId = source["clientId"];
	        this.name = source["name"];
	        this.clientName = source["clientName"];
	        this.status = source["status"];
	        this.description = source["description"];
	        this.startDate = source["startDate"];
	        this.endDate = source["endDate"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProjectCategory {
	    id: number;
	    userId: number;
	    name: string;
	    sortOrder: number;
	
	    static createFrom(source: any = {}) {
	        return new ProjectCategory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.name = source["name"];
	        this.sortOrder = source["sortOrder"];
	    }
	}
	export class ProjectStatusCount {
	    status: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new ProjectStatusCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.count = source["count"];
	    }
	}
	export class ProjectWithClient {
	    id: number;
	    userId: number;
	    teamType: string;
	    clientId: number;
	    name: string;
	    clientName: string;
	    status: string;
	    description: string;
	    startDate: string;
	    endDate?: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ProjectWithClient(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.teamType = source["teamType"];
	        this.clientId = source["clientId"];
	        this.name = source["name"];
	        this.clientName = source["clientName"];
	        this.status = source["status"];
	        this.description = source["description"];
	        this.startDate = source["startDate"];
	        this.endDate = source["endDate"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReportItem {
	    id: number;
	    reportId: number;
	    activityId?: number;
	    section: string;
	    category: string;
	    workType: string;
	    content: string;
	    period: string;
	    sortOrder: number;
	    isSelected: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ReportItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.reportId = source["reportId"];
	        this.activityId = source["activityId"];
	        this.section = source["section"];
	        this.category = source["category"];
	        this.workType = source["workType"];
	        this.content = source["content"];
	        this.period = source["period"];
	        this.sortOrder = source["sortOrder"];
	        this.isSelected = source["isSelected"];
	    }
	}
	export class SIProjectDetail {
	    id: number;
	    userId: number;
	    projectId: number;
	    projectType: string;
	    pmName: string;
	    totalMM: number;
	    currentPhase: string;
	    progressRate: number;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new SIProjectDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.projectId = source["projectId"];
	        this.projectType = source["projectType"];
	        this.pmName = source["pmName"];
	        this.totalMM = source["totalMM"];
	        this.currentPhase = source["currentPhase"];
	        this.progressRate = source["progressRate"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SIProjectMember {
	    id: number;
	    userId: number;
	    projectId: number;
	    teamMemberId: number;
	    memberName: string;
	    role: string;
	    allocationMM: number;
	    startDate: string;
	    endDate?: string;
	
	    static createFrom(source: any = {}) {
	        return new SIProjectMember(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.projectId = source["projectId"];
	        this.teamMemberId = source["teamMemberId"];
	        this.memberName = source["memberName"];
	        this.role = source["role"];
	        this.allocationMM = source["allocationMM"];
	        this.startDate = source["startDate"];
	        this.endDate = source["endDate"];
	    }
	}
	export class SIWeeklyReport {
	    id: number;
	    userId: number;
	    projectId: number;
	    weekStart: string;
	    weekEnd: string;
	    thisWeekProgress: string;
	    nextWeekPlan: string;
	    risks: string;
	    notes: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new SIWeeklyReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.projectId = source["projectId"];
	        this.weekStart = source["weekStart"];
	        this.weekEnd = source["weekEnd"];
	        this.thisWeekProgress = source["thisWeekProgress"];
	        this.nextWeekPlan = source["nextWeekPlan"];
	        this.risks = source["risks"];
	        this.notes = source["notes"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SIProjectView {
	    project: Project;
	    detail?: SIProjectDetail;
	    members: SIProjectMember[];
	    weeklyReport?: SIWeeklyReport;
	
	    static createFrom(source: any = {}) {
	        return new SIProjectView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.project = this.convertValues(source["project"], Project);
	        this.detail = this.convertValues(source["detail"], SIProjectDetail);
	        this.members = this.convertValues(source["members"], SIProjectMember);
	        this.weeklyReport = this.convertValues(source["weeklyReport"], SIWeeklyReport);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class UtilizationMemberRow {
	    teamMemberId: number;
	    teamMemberName: string;
	    allocationPercent: number;
	    unassigned: boolean;
	    overAllocated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UtilizationMemberRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.teamMemberId = source["teamMemberId"];
	        this.teamMemberName = source["teamMemberName"];
	        this.allocationPercent = source["allocationPercent"];
	        this.unassigned = source["unassigned"];
	        this.overAllocated = source["overAllocated"];
	    }
	}
	export class SIWeeklySnapshot {
	    weekStart: string;
	    weekEnd: string;
	    teamUtilizationPercent: number;
	    unassignedCount: number;
	    memberRows: UtilizationMemberRow[];
	    projectStatusCounts: ProjectStatusCount[];
	
	    static createFrom(source: any = {}) {
	        return new SIWeeklySnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.weekStart = source["weekStart"];
	        this.weekEnd = source["weekEnd"];
	        this.teamUtilizationPercent = source["teamUtilizationPercent"];
	        this.unassignedCount = source["unassignedCount"];
	        this.memberRows = this.convertValues(source["memberRows"], UtilizationMemberRow);
	        this.projectStatusCounts = this.convertValues(source["projectStatusCounts"], ProjectStatusCount);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TeamMember {
	    id: number;
	    userId: number;
	    name: string;
	    position: string;
	    email: string;
	    role: string;
	    employmentType: string;
	    hireDate: string;
	    resignDate?: string;
	    active: boolean;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new TeamMember(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.name = source["name"];
	        this.position = source["position"];
	        this.email = source["email"];
	        this.role = source["role"];
	        this.employmentType = source["employmentType"];
	        this.hireDate = source["hireDate"];
	        this.resignDate = source["resignDate"];
	        this.active = source["active"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class User {
	    id: number;
	    name: string;
	    team: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.team = source["team"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class WeeklyReport {
	    id: number;
	    userId: number;
	    weekStart: string;
	    weekEnd: string;
	    status: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new WeeklyReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.weekStart = source["weekStart"];
	        this.weekEnd = source["weekEnd"];
	        this.status = source["status"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class ActivityWithSource {
	    id: number;
	    integrationId: number;
	    source: string;
	    externalId: string;
	    title: string;
	    summary: string;
	    rawData: string;
	    activityDate: string;
	    // Go type: time
	    fetchedAt: any;
	    sourceLabel: string;
	    sourceIcon: string;
	
	    static createFrom(source: any = {}) {
	        return new ActivityWithSource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.integrationId = source["integrationId"];
	        this.source = source["source"];
	        this.externalId = source["externalId"];
	        this.title = source["title"];
	        this.summary = source["summary"];
	        this.rawData = source["rawData"];
	        this.activityDate = source["activityDate"];
	        this.fetchedAt = this.convertValues(source["fetchedAt"], null);
	        this.sourceLabel = source["sourceLabel"];
	        this.sourceIcon = source["sourceIcon"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StatusResult {
	    ok: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new StatusResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.message = source["message"];
	    }
	}
	export class SyncResult {
	    success: boolean;
	    count: number;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new SyncResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.count = source["count"];
	        this.message = source["message"];
	    }
	}
	export class WeekInfo {
	    weekStart: string;
	    weekEnd: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new WeekInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.weekStart = source["weekStart"];
	        this.weekEnd = source["weekEnd"];
	        this.label = source["label"];
	    }
	}

}

