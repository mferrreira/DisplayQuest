import type { z } from "zod"

import type { DisplayQuestClient } from "../displayquest-client.js"

export type AnyZodObject = z.ZodObject<any>

export interface ToolContext {
  client: DisplayQuestClient
}

export interface ToolDefinition<Schema extends AnyZodObject = AnyZodObject> {
  name: string
  title: string
  description: string
  readOnly: boolean
  inputSchema: Schema
  returns: string
  /** Status HTTP que a rota pode devolver; o contrato §7.1 lista números, não código de erro. */
  errors: readonly number[]
  handler: (args: z.infer<Schema>, ctx: ToolContext) => Promise<unknown>
}

export function defineTool<Schema extends AnyZodObject>(
  definition: ToolDefinition<Schema>,
): ToolDefinition<Schema> {
  return definition
}
