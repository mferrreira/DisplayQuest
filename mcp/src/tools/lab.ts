import { z } from "zod"

import { asItems } from "./helpers.js"
import { defineTool } from "./types.js"

export const laboratoryScheduleGetTool = defineTool({
  name: "laboratory_schedule_get",
  title: "Horários do laboratório",
  description: "Horários do laboratório.",
  readOnly: true,
  inputSchema: z.object({}),
  returns: "schedules: lista de horários; count: total.",
  errors: [401],
  handler: async (_args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: "/api/laboratory-schedule",
    })
    const schedules = asItems(body, "schedules")
    return { schedules, count: schedules.length }
  },
})
