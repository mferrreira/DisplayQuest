import { peopleListTool, peopleStatisticsTool, leaderboardGetTool } from "./people.js"
import { projectListTool, projectGetTool, projectOverviewTool, memberPerformanceTool } from "./projects.js"
import { taskListTool, globalProgressGetTool } from "./tasks.js"
import {
  hoursGetTool,
  workSessionsListTool,
  weeklyHoursHistoryGetTool,
  weeklyReportListTool,
} from "./hours.js"
import { laboratoryScheduleGetTool } from "./lab.js"
import {
  technicalReportListTool,
  technicalReportSaveTool,
  technicalReportGenerateTool,
  technicalReportDraftTool,
} from "./tech-reports.js"
import { projectCreateTool, projectUpdateTool, deliverableCreateTool, activityCreateTool, activityUpdateTool } from "./project-writes.js"
import { weeklyReportGenerateTool, weeklyReportBulkGenerateTool } from "./reports.js"
import type { ToolDefinition } from "./types.js"

/**
 * Catálogo do plan-v7: 15 leituras e 10 escritas. A ordem é a do contrato `tools.json`
 * (§7.1) e o `tools/list` do servidor serve exatamente esta lista.
 */
export const ALL_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  peopleListTool,
  peopleStatisticsTool,
  leaderboardGetTool,
  projectListTool,
  projectGetTool,
  projectOverviewTool,
  memberPerformanceTool,
  taskListTool,
  globalProgressGetTool,
  hoursGetTool,
  workSessionsListTool,
  weeklyHoursHistoryGetTool,
  laboratoryScheduleGetTool,
  weeklyReportListTool,
  technicalReportListTool,
  projectCreateTool,
  projectUpdateTool,
  deliverableCreateTool,
  activityCreateTool,
  activityUpdateTool,
  weeklyReportGenerateTool,
  weeklyReportBulkGenerateTool,
  technicalReportSaveTool,
  technicalReportGenerateTool,
  technicalReportDraftTool,
]

export const READ_TOOL_COUNT = 15
export const WRITE_TOOL_COUNT = 10
export const TOTAL_TOOL_COUNT = READ_TOOL_COUNT + WRITE_TOOL_COUNT
