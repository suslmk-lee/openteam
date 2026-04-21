export namespace ai {
	
	export class PolicyConfig {
	    chatAllowOverride: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PolicyConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.chatAllowOverride = source["chatAllowOverride"];
	    }
	}
	export class ProviderConfig {
	    enabled: boolean;
	    apiKey?: string;
	    model?: string;
	    baseUrl?: string;
	    mode?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProviderConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.baseUrl = source["baseUrl"];
	        this.mode = source["mode"];
	    }
	}
	export class Settings {
	    defaultProvider: string;
	    policy: PolicyConfig;
	    providers: Record<string, ProviderConfig>;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.defaultProvider = source["defaultProvider"];
	        this.policy = this.convertValues(source["policy"], PolicyConfig);
	        this.providers = this.convertValues(source["providers"], ProviderConfig, true);
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

export namespace db {
	
	export class AIBillingPlan {
	    id: number;
	    userId: number;
	    providerId: number;
	    modelId?: number;
	    monthlyFixedUsd: number;
	    includedInputTokens: number;
	    includedOutputTokens: number;
	    overageInputPer1kUsd: number;
	    overageOutputPer1kUsd: number;
	    effectiveFrom: string;
	    effectiveTo?: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIBillingPlan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.providerId = source["providerId"];
	        this.modelId = source["modelId"];
	        this.monthlyFixedUsd = source["monthlyFixedUsd"];
	        this.includedInputTokens = source["includedInputTokens"];
	        this.includedOutputTokens = source["includedOutputTokens"];
	        this.overageInputPer1kUsd = source["overageInputPer1kUsd"];
	        this.overageOutputPer1kUsd = source["overageOutputPer1kUsd"];
	        this.effectiveFrom = source["effectiveFrom"];
	        this.effectiveTo = source["effectiveTo"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class AIFXRate {
	    day: string;
	    base: string;
	    quote: string;
	    rate: number;
	    source: string;
	    fetchedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIFXRate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"];
	        this.base = source["base"];
	        this.quote = source["quote"];
	        this.rate = source["rate"];
	        this.source = source["source"];
	        this.fetchedAt = source["fetchedAt"];
	    }
	}
	export class AIModel {
	    id: number;
	    userId: number;
	    providerId: number;
	    modelCode: string;
	    displayName: string;
	    enabled: boolean;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIModel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.providerId = source["providerId"];
	        this.modelCode = source["modelCode"];
	        this.displayName = source["displayName"];
	        this.enabled = source["enabled"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class AIProvider {
	    id: number;
	    userId: number;
	    code: string;
	    displayName: string;
	    enabled: boolean;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIProvider(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.code = source["code"];
	        this.displayName = source["displayName"];
	        this.enabled = source["enabled"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class AIUsageDailyPoint {
	    day: string;
	    totalCostUsd: number;
	    totalCostKrw: number;
	    inputTokens: number;
	    outputTokens: number;
	
	    static createFrom(source: any = {}) {
	        return new AIUsageDailyPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"];
	        this.totalCostUsd = source["totalCostUsd"];
	        this.totalCostKrw = source["totalCostKrw"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	    }
	}
	export class AIUsageDailySeriesPoint {
	    day: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalCostUsd: number;
	    totalCostKrw: number;
	
	    static createFrom(source: any = {}) {
	        return new AIUsageDailySeriesPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalCostUsd = source["totalCostUsd"];
	        this.totalCostKrw = source["totalCostKrw"];
	    }
	}
	export class AIUsageSummaryRow {
	    providerCode: string;
	    providerName: string;
	    modelCode: string;
	    modelName: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    cacheReadTokens: number;
	    cacheCreateTokens: number;
	    paygCostUsd: number;
	    fixedCostUsd: number;
	    overageCostUsd: number;
	    totalCostUsd: number;
	    totalCostKrw: number;
	    isUnregistered: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIUsageSummaryRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.providerCode = source["providerCode"];
	        this.providerName = source["providerName"];
	        this.modelCode = source["modelCode"];
	        this.modelName = source["modelName"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.cacheReadTokens = source["cacheReadTokens"];
	        this.cacheCreateTokens = source["cacheCreateTokens"];
	        this.paygCostUsd = source["paygCostUsd"];
	        this.fixedCostUsd = source["fixedCostUsd"];
	        this.overageCostUsd = source["overageCostUsd"];
	        this.totalCostUsd = source["totalCostUsd"];
	        this.totalCostKrw = source["totalCostKrw"];
	        this.isUnregistered = source["isUnregistered"];
	    }
	}
	export class AIUsageOverview {
	    month: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalCostUsd: number;
	    totalCostKrw: number;
	    fixedCostUsd: number;
	    overageCostUsd: number;
	    paygCostUsd: number;
	
	    static createFrom(source: any = {}) {
	        return new AIUsageOverview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.month = source["month"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalCostUsd = source["totalCostUsd"];
	        this.totalCostKrw = source["totalCostKrw"];
	        this.fixedCostUsd = source["fixedCostUsd"];
	        this.overageCostUsd = source["overageCostUsd"];
	        this.paygCostUsd = source["paygCostUsd"];
	    }
	}
	export class AIUsageDashboard {
	    overview: AIUsageOverview;
	    byProvider: AIUsageSummaryRow[];
	    byModel: AIUsageSummaryRow[];
	    unregistered: AIUsageSummaryRow[];
	    daily: AIUsageDailyPoint[];
	    fxRateUsed: number;
	    fxRateDate: string;
	    fxSource: string;
	    fxFallbackUsed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIUsageDashboard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.overview = this.convertValues(source["overview"], AIUsageOverview);
	        this.byProvider = this.convertValues(source["byProvider"], AIUsageSummaryRow);
	        this.byModel = this.convertValues(source["byModel"], AIUsageSummaryRow);
	        this.unregistered = this.convertValues(source["unregistered"], AIUsageSummaryRow);
	        this.daily = this.convertValues(source["daily"], AIUsageDailyPoint);
	        this.fxRateUsed = source["fxRateUsed"];
	        this.fxRateDate = source["fxRateDate"];
	        this.fxSource = source["fxSource"];
	        this.fxFallbackUsed = source["fxFallbackUsed"];
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
	export class AIUsageHistoryEvent {
	    id: number;
	    occurredAt: string;
	    day: string;
	    userId: number;
	    providerId: number;
	    modelId: number;
	    rawProvider: string;
	    rawModel: string;
	    feature: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    cacheReadTokens: number;
	    cacheCreateTokens: number;
	    paygCostUsd: number;
	    metadataJson: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIUsageHistoryEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.occurredAt = source["occurredAt"];
	        this.day = source["day"];
	        this.userId = source["userId"];
	        this.providerId = source["providerId"];
	        this.modelId = source["modelId"];
	        this.rawProvider = source["rawProvider"];
	        this.rawModel = source["rawModel"];
	        this.feature = source["feature"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.cacheReadTokens = source["cacheReadTokens"];
	        this.cacheCreateTokens = source["cacheCreateTokens"];
	        this.paygCostUsd = source["paygCostUsd"];
	        this.metadataJson = source["metadataJson"];
	        this.createdAt = source["createdAt"];
	    }
	}
	
	export class AIUsageSeriesRow {
	    providerCode: string;
	    providerName: string;
	    modelCode: string;
	    modelName: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalCostUsd: number;
	    totalCostKrw: number;
	    daily: AIUsageDailySeriesPoint[];
	
	    static createFrom(source: any = {}) {
	        return new AIUsageSeriesRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.providerCode = source["providerCode"];
	        this.providerName = source["providerName"];
	        this.modelCode = source["modelCode"];
	        this.modelName = source["modelName"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalCostUsd = source["totalCostUsd"];
	        this.totalCostKrw = source["totalCostKrw"];
	        this.daily = this.convertValues(source["daily"], AIUsageDailySeriesPoint);
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
	
	export class AIUsageTodayHalfHourPoint {
	    slot: string;
	    startAt: string;
	    endAt: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalTokens: number;
	    paygCostUsd: number;
	    paygCostKrw: number;
	
	    static createFrom(source: any = {}) {
	        return new AIUsageTodayHalfHourPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.slot = source["slot"];
	        this.startAt = source["startAt"];
	        this.endAt = source["endAt"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalTokens = source["totalTokens"];
	        this.paygCostUsd = source["paygCostUsd"];
	        this.paygCostKrw = source["paygCostKrw"];
	    }
	}
	export class Activity {
	    id: number;
	    integrationId: number;
	    source: string;
	    externalId: string;
	    title: string;
	    summary: string;
	    rawData: string;
	    activityDate: string;
	    date: string;
	    activityDateTime?: string;
	    endDateTime?: string;
	    calendarId?: string;
	    fetchedAt: string;
	
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
	        this.date = source["date"];
	        this.activityDateTime = source["activityDateTime"];
	        this.endDateTime = source["endDateTime"];
	        this.calendarId = source["calendarId"];
	        this.fetchedAt = source["fetchedAt"];
	    }
	}
	export class AttendanceRecord {
	    id: number;
	    userId: number;
	    teamMemberId: number;
	    teamMemberName: string;
	    recordDate: string;
	    type: string;
	    checkInTime?: string;
	    checkOutTime?: string;
	    notes: string;
	    integrationSource: string;
	    externalId: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AttendanceRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.teamMemberId = source["teamMemberId"];
	        this.teamMemberName = source["teamMemberName"];
	        this.recordDate = source["recordDate"];
	        this.type = source["type"];
	        this.checkInTime = source["checkInTime"];
	        this.checkOutTime = source["checkOutTime"];
	        this.notes = source["notes"];
	        this.integrationSource = source["integrationSource"];
	        this.externalId = source["externalId"];
	        this.createdAt = source["createdAt"];
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
	    createdAt: string;
	
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
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ExcelTemplate {
	    id: number;
	    userId: number;
	    teamType: string;
	    name: string;
	    filePath: string;
	    structureJson: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ExcelTemplate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.teamType = source["teamType"];
	        this.name = source["name"];
	        this.filePath = source["filePath"];
	        this.structureJson = source["structureJson"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class IngestResult {
	    sourceType: string;
	    source: string;
	    model: string;
	    requestedBy: string;
	    status: string;
	    warnings?: string[];
	    rawPath?: string;
	    wikiSourcePath?: string;
	    derivedPaths?: string[];
	    createdPaths?: string[];
	    indexPath?: string;
	    logPath?: string;
	    elapsedMs?: number;
	    extractorUsed?: boolean;
	    extractorWarning?: string;
	    skillSourceDir?: string;
	    processLogs?: string[];
	
	    static createFrom(source: any = {}) {
	        return new IngestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceType = source["sourceType"];
	        this.source = source["source"];
	        this.model = source["model"];
	        this.requestedBy = source["requestedBy"];
	        this.status = source["status"];
	        this.warnings = source["warnings"];
	        this.rawPath = source["rawPath"];
	        this.wikiSourcePath = source["wikiSourcePath"];
	        this.derivedPaths = source["derivedPaths"];
	        this.createdPaths = source["createdPaths"];
	        this.indexPath = source["indexPath"];
	        this.logPath = source["logPath"];
	        this.elapsedMs = source["elapsedMs"];
	        this.extractorUsed = source["extractorUsed"];
	        this.extractorWarning = source["extractorWarning"];
	        this.skillSourceDir = source["skillSourceDir"];
	        this.processLogs = source["processLogs"];
	    }
	}
	export class Integration {
	    id: number;
	    userId: number;
	    toolType: string;
	    configJson: string;
	    enabled: boolean;
	    lastSyncedAt?: string;
	
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
	        this.lastSyncedAt = source["lastSyncedAt"];
	    }
	}
	export class Issue {
	    id: number;
	    userId: number;
	    projectId?: number;
	    title: string;
	    description: string;
	    severity: string;
	    status: string;
	    assignee: string;
	    dueDate?: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Issue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.projectId = source["projectId"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.severity = source["severity"];
	        this.status = source["status"];
	        this.assignee = source["assignee"];
	        this.dueDate = source["dueDate"];
	        this.createdAt = source["createdAt"];
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
	    createdAt: string;
	
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
	        this.createdAt = source["createdAt"];
	    }
	}
	export class MyAttendanceSummary {
	    vacationDays: number;
	    morningHalfDays: number;
	    afternoonHalfDays: number;
	    totalDays: number;
	    lateCount: number;
	
	    static createFrom(source: any = {}) {
	        return new MyAttendanceSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.vacationDays = source["vacationDays"];
	        this.morningHalfDays = source["morningHalfDays"];
	        this.afternoonHalfDays = source["afternoonHalfDays"];
	        this.totalDays = source["totalDays"];
	        this.lateCount = source["lateCount"];
	    }
	}
	export class PersonalAIAutoCollectConfig {
	    enabled: boolean;
	    intervalSeconds: number;
	    nextRunAt: string;
	    lastTriggeredAt: string;
	    lastTriggeredMonth: string;
	
	    static createFrom(source: any = {}) {
	        return new PersonalAIAutoCollectConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.intervalSeconds = source["intervalSeconds"];
	        this.nextRunAt = source["nextRunAt"];
	        this.lastTriggeredAt = source["lastTriggeredAt"];
	        this.lastTriggeredMonth = source["lastTriggeredMonth"];
	    }
	}
	export class PersonalAICollectorResult {
	    sourceCode: string;
	    sourceName: string;
	    scannedFiles: number;
	    parsedEntries: number;
	    importedRows: number;
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new PersonalAICollectorResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceCode = source["sourceCode"];
	        this.sourceName = source["sourceName"];
	        this.scannedFiles = source["scannedFiles"];
	        this.parsedEntries = source["parsedEntries"];
	        this.importedRows = source["importedRows"];
	        this.warnings = source["warnings"];
	    }
	}
	export class PersonalAICollectorResponse {
	    month: string;
	    results: PersonalAICollectorResult[];
	
	    static createFrom(source: any = {}) {
	        return new PersonalAICollectorResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.month = source["month"];
	        this.results = this.convertValues(source["results"], PersonalAICollectorResult);
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
	export class PersonalAICollectStatus {
	    running: boolean;
	    trigger: string;
	    month: string;
	    startedAt: string;
	    finishedAt: string;
	    lastError: string;
	    lastResult?: PersonalAICollectorResponse;
	    autoEnabled: boolean;
	    autoIntervalSeconds: number;
	    autoNextRunAt: string;
	    autoLastTriggeredAt: string;
	    autoLastTriggeredMonth: string;
	
	    static createFrom(source: any = {}) {
	        return new PersonalAICollectStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.trigger = source["trigger"];
	        this.month = source["month"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	        this.lastError = source["lastError"];
	        this.lastResult = this.convertValues(source["lastResult"], PersonalAICollectorResponse);
	        this.autoEnabled = source["autoEnabled"];
	        this.autoIntervalSeconds = source["autoIntervalSeconds"];
	        this.autoNextRunAt = source["autoNextRunAt"];
	        this.autoLastTriggeredAt = source["autoLastTriggeredAt"];
	        this.autoLastTriggeredMonth = source["autoLastTriggeredMonth"];
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
	
	
	export class PersonalAISourceSummaryRow {
	    sourceCode: string;
	    sourceName: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalCostUsd: number;
	    totalCostKrw: number;
	
	    static createFrom(source: any = {}) {
	        return new PersonalAISourceSummaryRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceCode = source["sourceCode"];
	        this.sourceName = source["sourceName"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalCostUsd = source["totalCostUsd"];
	        this.totalCostKrw = source["totalCostKrw"];
	    }
	}
	export class PersonalAIUsageOverview {
	    month: string;
	    requestCount: number;
	    internalInputTokens: number;
	    internalOutputTokens: number;
	    externalInputTokens: number;
	    externalOutputTokens: number;
	    internalCostUsd: number;
	    externalCostUsd: number;
	    totalCostUsd: number;
	    totalCostKrw: number;
	
	    static createFrom(source: any = {}) {
	        return new PersonalAIUsageOverview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.month = source["month"];
	        this.requestCount = source["requestCount"];
	        this.internalInputTokens = source["internalInputTokens"];
	        this.internalOutputTokens = source["internalOutputTokens"];
	        this.externalInputTokens = source["externalInputTokens"];
	        this.externalOutputTokens = source["externalOutputTokens"];
	        this.internalCostUsd = source["internalCostUsd"];
	        this.externalCostUsd = source["externalCostUsd"];
	        this.totalCostUsd = source["totalCostUsd"];
	        this.totalCostKrw = source["totalCostKrw"];
	    }
	}
	export class PersonalAIUsageDashboard {
	    overview: PersonalAIUsageOverview;
	    bySource: PersonalAISourceSummaryRow[];
	    byProvider: AIUsageSummaryRow[];
	    byModel: AIUsageSummaryRow[];
	    daily: AIUsageDailyPoint[];
	    dailyByProvider: AIUsageSeriesRow[];
	    dailyByModel: AIUsageSeriesRow[];
	    fxRateUsed: number;
	    fxRateDate: string;
	    fxSource: string;
	    fxFallbackUsed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PersonalAIUsageDashboard(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.overview = this.convertValues(source["overview"], PersonalAIUsageOverview);
	        this.bySource = this.convertValues(source["bySource"], PersonalAISourceSummaryRow);
	        this.byProvider = this.convertValues(source["byProvider"], AIUsageSummaryRow);
	        this.byModel = this.convertValues(source["byModel"], AIUsageSummaryRow);
	        this.daily = this.convertValues(source["daily"], AIUsageDailyPoint);
	        this.dailyByProvider = this.convertValues(source["dailyByProvider"], AIUsageSeriesRow);
	        this.dailyByModel = this.convertValues(source["dailyByModel"], AIUsageSeriesRow);
	        this.fxRateUsed = source["fxRateUsed"];
	        this.fxRateDate = source["fxRateDate"];
	        this.fxSource = source["fxSource"];
	        this.fxFallbackUsed = source["fxFallbackUsed"];
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
	
	export class PersonalAIUsageTodayModelRow {
	    providerCode: string;
	    providerName: string;
	    modelCode: string;
	    modelName: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalTokens: number;
	    paygCostUsd: number;
	    paygCostKrw: number;
	    buckets: AIUsageTodayHalfHourPoint[];
	
	    static createFrom(source: any = {}) {
	        return new PersonalAIUsageTodayModelRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.providerCode = source["providerCode"];
	        this.providerName = source["providerName"];
	        this.modelCode = source["modelCode"];
	        this.modelName = source["modelName"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalTokens = source["totalTokens"];
	        this.paygCostUsd = source["paygCostUsd"];
	        this.paygCostKrw = source["paygCostKrw"];
	        this.buckets = this.convertValues(source["buckets"], AIUsageTodayHalfHourPoint);
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
	export class PersonalAIUsageTodayProviderRow {
	    providerCode: string;
	    providerName: string;
	    requestCount: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalTokens: number;
	    paygCostUsd: number;
	    paygCostKrw: number;
	    buckets: AIUsageTodayHalfHourPoint[];
	
	    static createFrom(source: any = {}) {
	        return new PersonalAIUsageTodayProviderRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.providerCode = source["providerCode"];
	        this.providerName = source["providerName"];
	        this.requestCount = source["requestCount"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalTokens = source["totalTokens"];
	        this.paygCostUsd = source["paygCostUsd"];
	        this.paygCostKrw = source["paygCostKrw"];
	        this.buckets = this.convertValues(source["buckets"], AIUsageTodayHalfHourPoint);
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
	export class PersonalAIUsageTodayUsage {
	    day: string;
	    timezone: string;
	    buckets: AIUsageTodayHalfHourPoint[];
	    byProvider: PersonalAIUsageTodayProviderRow[];
	    byModel: PersonalAIUsageTodayModelRow[];
	    fxRateUsed: number;
	    fxRateDate: string;
	    fxSource: string;
	    fxFallbackUsed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PersonalAIUsageTodayUsage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.day = source["day"];
	        this.timezone = source["timezone"];
	        this.buckets = this.convertValues(source["buckets"], AIUsageTodayHalfHourPoint);
	        this.byProvider = this.convertValues(source["byProvider"], PersonalAIUsageTodayProviderRow);
	        this.byModel = this.convertValues(source["byModel"], PersonalAIUsageTodayModelRow);
	        this.fxRateUsed = source["fxRateUsed"];
	        this.fxRateDate = source["fxRateDate"];
	        this.fxSource = source["fxSource"];
	        this.fxFallbackUsed = source["fxFallbackUsed"];
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
	    createdAt: string;
	    projectType: string;
	    pmName: string;
	    totalMM: number;
	    progressRate: number;
	
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
	        this.createdAt = source["createdAt"];
	        this.projectType = source["projectType"];
	        this.pmName = source["pmName"];
	        this.totalMM = source["totalMM"];
	        this.progressRate = source["progressRate"];
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
	    createdAt: string;
	    projectType: string;
	    pmName: string;
	    totalMM: number;
	    progressRate: number;
	
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
	        this.createdAt = source["createdAt"];
	        this.projectType = source["projectType"];
	        this.pmName = source["pmName"];
	        this.totalMM = source["totalMM"];
	        this.progressRate = source["progressRate"];
	    }
	}
	export class ReportInsightActivity {
	    activityId: number;
	    source: string;
	    title: string;
	    summary: string;
	    activityDate: string;
	
	    static createFrom(source: any = {}) {
	        return new ReportInsightActivity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activityId = source["activityId"];
	        this.source = source["source"];
	        this.title = source["title"];
	        this.summary = source["summary"];
	        this.activityDate = source["activityDate"];
	    }
	}
	export class ReportInsightDraft {
	    key: string;
	    suggestedSection: string;
	    suggestedCategory: string;
	    suggestedWorkType: string;
	    content: string;
	    activityIds: number[];
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new ReportInsightDraft(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.suggestedSection = source["suggestedSection"];
	        this.suggestedCategory = source["suggestedCategory"];
	        this.suggestedWorkType = source["suggestedWorkType"];
	        this.content = source["content"];
	        this.activityIds = source["activityIds"];
	        this.reason = source["reason"];
	    }
	}
	export class ReportInsightSummary {
	    totalActivities: number;
	    linkedActivities: number;
	    unlinkedActivities: number;
	    needsReview: number;
	
	    static createFrom(source: any = {}) {
	        return new ReportInsightSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalActivities = source["totalActivities"];
	        this.linkedActivities = source["linkedActivities"];
	        this.unlinkedActivities = source["unlinkedActivities"];
	        this.needsReview = source["needsReview"];
	    }
	}
	export class ReportInsights {
	    summary: ReportInsightSummary;
	    unlinkedActivities: ReportInsightActivity[];
	    draftCandidates: ReportInsightDraft[];
	    needsReview: ReportInsightActivity[];
	
	    static createFrom(source: any = {}) {
	        return new ReportInsights(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.summary = this.convertValues(source["summary"], ReportInsightSummary);
	        this.unlinkedActivities = this.convertValues(source["unlinkedActivities"], ReportInsightActivity);
	        this.draftCandidates = this.convertValues(source["draftCandidates"], ReportInsightDraft);
	        this.needsReview = this.convertValues(source["needsReview"], ReportInsightActivity);
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
	export class Retrospective {
	    id: number;
	    userId: number;
	    weekStart: string;
	    weekEnd: string;
	    wentWell: string;
	    toImprove: string;
	    actionItems: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Retrospective(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.userId = source["userId"];
	        this.weekStart = source["weekStart"];
	        this.weekEnd = source["weekEnd"];
	        this.wentWell = source["wentWell"];
	        this.toImprove = source["toImprove"];
	        this.actionItems = source["actionItems"];
	        this.createdAt = source["createdAt"];
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
	    createdAt: string;
	
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
	        this.createdAt = source["createdAt"];
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
	    createdAt: string;
	
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
	        this.createdAt = source["createdAt"];
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
	    linearUserId: string;
	    createdAt: string;
	
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
	        this.linearUserId = source["linearUserId"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class TeamProfile {
	    teamType: string;
	    teamName: string;
	    userName: string;
	    memberCount: number;
	    setupDone: boolean;
	    linearApiKey: string;
	    linearTeamId: string;
	    linearUserId: string;
	    vaultRoot: string;
	
	    static createFrom(source: any = {}) {
	        return new TeamProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.teamType = source["teamType"];
	        this.teamName = source["teamName"];
	        this.userName = source["userName"];
	        this.memberCount = source["memberCount"];
	        this.setupDone = source["setupDone"];
	        this.linearApiKey = source["linearApiKey"];
	        this.linearTeamId = source["linearTeamId"];
	        this.linearUserId = source["linearUserId"];
	        this.vaultRoot = source["vaultRoot"];
	    }
	}
	export class User {
	    id: number;
	    name: string;
	    team: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.team = source["team"];
	        this.createdAt = source["createdAt"];
	    }
	}
	
	export class VaultFile {
	    id: number;
	    name: string;
	    path: string;
	    content: string;
	    modifiedAt: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new VaultFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.content = source["content"];
	        this.modifiedAt = source["modifiedAt"];
	        this.size = source["size"];
	    }
	}
	export class VaultItem {
	    id: number;
	    type: string;
	    name: string;
	    path: string;
	    parentId?: number;
	    modifiedAt: string;
	    size: number;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new VaultItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.parentId = source["parentId"];
	        this.modifiedAt = source["modifiedAt"];
	        this.size = source["size"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class VaultReference {
	    path: string;
	    title: string;
	    snippet: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new VaultReference(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.title = source["title"];
	        this.snippet = source["snippet"];
	        this.content = source["content"];
	    }
	}
	export class WeeklyReport {
	    id: number;
	    userId: number;
	    weekStart: string;
	    weekEnd: string;
	    status: string;
	    createdAt: string;
	
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
	        this.createdAt = source["createdAt"];
	    }
	}

}

export namespace integrations {
	
	export class Calendar {
	    id: string;
	    summary: string;
	    primary?: boolean;
	    selected?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Calendar(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.summary = source["summary"];
	        this.primary = source["primary"];
	        this.selected = source["selected"];
	    }
	}

}

export namespace main {
	
	export class AIChatResult {
	    reply: string;
	    provider: string;
	    model: string;
	
	    static createFrom(source: any = {}) {
	        return new AIChatResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reply = source["reply"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	    }
	}
	export class ActivityWithSource {
	    id: number;
	    integrationId: number;
	    source: string;
	    externalId: string;
	    title: string;
	    summary: string;
	    rawData: string;
	    activityDate: string;
	    date: string;
	    activityDateTime?: string;
	    endDateTime?: string;
	    calendarId?: string;
	    fetchedAt: string;
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
	        this.date = source["date"];
	        this.activityDateTime = source["activityDateTime"];
	        this.endDateTime = source["endDateTime"];
	        this.calendarId = source["calendarId"];
	        this.fetchedAt = source["fetchedAt"];
	        this.sourceLabel = source["sourceLabel"];
	        this.sourceIcon = source["sourceIcon"];
	    }
	}
	export class ClaudeChatResult {
	    reply: string;
	    sessionId: string;
	    model: string;
	    numTurns: number;
	    inputTokens: number;
	    outputTokens: number;
	    cacheReadTokens: number;
	    cacheCreateTokens: number;
	    costUsd: number;
	
	    static createFrom(source: any = {}) {
	        return new ClaudeChatResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reply = source["reply"];
	        this.sessionId = source["sessionId"];
	        this.model = source["model"];
	        this.numTurns = source["numTurns"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.cacheReadTokens = source["cacheReadTokens"];
	        this.cacheCreateTokens = source["cacheCreateTokens"];
	        this.costUsd = source["costUsd"];
	    }
	}
	export class LinearCycle {
	    id: string;
	    name: string;
	    number: number;
	    startsAt: string;
	    endsAt: string;
	    completedAt?: string;
	    issueCount: number;
	    completedIssueCount: number;
	
	    static createFrom(source: any = {}) {
	        return new LinearCycle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.number = source["number"];
	        this.startsAt = source["startsAt"];
	        this.endsAt = source["endsAt"];
	        this.completedAt = source["completedAt"];
	        this.issueCount = source["issueCount"];
	        this.completedIssueCount = source["completedIssueCount"];
	    }
	}
	export class LinearIssueProject {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new LinearIssueProject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class LinearIssueLabel {
	    id: string;
	    name: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new LinearIssueLabel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	    }
	}
	export class LinearIssueLabelNodes {
	    nodes: LinearIssueLabel[];
	
	    static createFrom(source: any = {}) {
	        return new LinearIssueLabelNodes(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodes = this.convertValues(source["nodes"], LinearIssueLabel);
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
	export class LinearIssueAssignee {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new LinearIssueAssignee(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class LinearIssueState {
	    id: string;
	    name: string;
	    color: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new LinearIssueState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.type = source["type"];
	    }
	}
	export class LinearIssue {
	    id: string;
	    title: string;
	    identifier: string;
	    priority: number;
	    state: LinearIssueState;
	    assignee?: LinearIssueAssignee;
	    url: string;
	    createdAt: string;
	    updatedAt: string;
	    dueDate?: string;
	    description: string;
	    estimate?: number;
	    labels?: LinearIssueLabelNodes;
	    project?: LinearIssueProject;
	
	    static createFrom(source: any = {}) {
	        return new LinearIssue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.identifier = source["identifier"];
	        this.priority = source["priority"];
	        this.state = this.convertValues(source["state"], LinearIssueState);
	        this.assignee = this.convertValues(source["assignee"], LinearIssueAssignee);
	        this.url = source["url"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.dueDate = source["dueDate"];
	        this.description = source["description"];
	        this.estimate = source["estimate"];
	        this.labels = this.convertValues(source["labels"], LinearIssueLabelNodes);
	        this.project = this.convertValues(source["project"], LinearIssueProject);
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
	export class LinearProject {
	    id: string;
	    name: string;
	    state: string;
	    progress: number;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new LinearProject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.state = source["state"];
	        this.progress = source["progress"];
	        this.url = source["url"];
	    }
	}
	export class LinearDashboardData {
	    projects: LinearProject[];
	    issues: LinearIssue[];
	    cycles: LinearCycle[];
	    issueCounts: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new LinearDashboardData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.projects = this.convertValues(source["projects"], LinearProject);
	        this.issues = this.convertValues(source["issues"], LinearIssue);
	        this.cycles = this.convertValues(source["cycles"], LinearCycle);
	        this.issueCounts = source["issueCounts"];
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
	
	
	
	
	
	
	export class LinearIssueUpdateInput {
	    stateId?: string;
	    priority?: number;
	    dueDate?: string;
	    assigneeId?: string;
	    labelIds?: string[];
	
	    static createFrom(source: any = {}) {
	        return new LinearIssueUpdateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.stateId = source["stateId"];
	        this.priority = source["priority"];
	        this.dueDate = source["dueDate"];
	        this.assigneeId = source["assigneeId"];
	        this.labelIds = source["labelIds"];
	    }
	}
	
	export class LinearTeamMember {
	    id: string;
	    name: string;
	    email: string;
	    displayName: string;
	
	    static createFrom(source: any = {}) {
	        return new LinearTeamMember(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.email = source["email"];
	        this.displayName = source["displayName"];
	    }
	}
	export class LinearWorkflowState {
	    id: string;
	    name: string;
	    color: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new LinearWorkflowState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.type = source["type"];
	    }
	}
	export class OpenAIChatMessage {
	    role: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenAIChatMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	    }
	}
	export class OpenAIChatResult {
	    reply: string;
	    model: string;
	    inputTokens: number;
	    outputTokens: number;
	    totalTokens: number;
	    costUsd: number;
	
	    static createFrom(source: any = {}) {
	        return new OpenAIChatResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reply = source["reply"];
	        this.model = source["model"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalTokens = source["totalTokens"];
	        this.costUsd = source["costUsd"];
	    }
	}
	export class SkillCommand {
	    skill: string;
	    cmd: string;
	    desc: string;
	
	    static createFrom(source: any = {}) {
	        return new SkillCommand(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.skill = source["skill"];
	        this.cmd = source["cmd"];
	        this.desc = source["desc"];
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

