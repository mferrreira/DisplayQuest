/** Minimal project view the task use cases need (leader/creator gates). */
export interface TaskProjectRecord {
  id: number
  leaderId: number | null
  createdBy: number | null
}

/** TaskProjectsPort — OND4-B3 (R1). */
export interface TaskProjectsPort {
  findById(id: number): Promise<TaskProjectRecord | null>
}
