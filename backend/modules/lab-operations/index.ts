import type {
  CreateLabEventCommand,
  CreateLaboratoryScheduleCommand,
  CreateUserScheduleCommand,
  DeleteUserScheduleCommand,
  LabIssueQuery,
  ListUserSchedulesQuery,
  ListResponsibilitiesQuery,
  StartResponsibilityCommand,
  UpdateUserScheduleCommand,
  UpdateLaboratoryScheduleCommand,
} from "@/backend/modules/lab-operations/application/contracts"
import type { LabOperationsGateway } from "@/backend/modules/lab-operations/application/ports/lab-operations.gateway"
import { createLabOperationsGateway } from "@/backend/modules/lab-operations/infrastructure/lab-operations.gateway"

export class LabOperationsModule {
  constructor(private readonly gateway: LabOperationsGateway) {}

  async listIssues(query?: LabIssueQuery) {
    return await this.gateway.listIssues(query)
  }

  async getIssue(issueId: number) {
    return await this.gateway.getIssue(issueId)
  }

  async createIssue(command: Record<string, unknown>) {
    return await this.gateway.createIssue(command)
  }

  async updateIssue(issueId: number, command: Record<string, unknown>) {
    return await this.gateway.updateIssue(issueId, command)
  }

  async deleteIssue(issueId: number) {
    await this.gateway.deleteIssue(issueId)
  }

  async assignIssue(issueId: number, assigneeId: number) {
    return await this.gateway.assignIssue(issueId, assigneeId)
  }

  async unassignIssue(issueId: number) {
    return await this.gateway.unassignIssue(issueId)
  }

  async startIssueProgress(issueId: number) {
    return await this.gateway.startIssueProgress(issueId)
  }

  async resolveIssue(issueId: number, resolution?: string) {
    return await this.gateway.resolveIssue(issueId, resolution)
  }

  async closeIssue(issueId: number) {
    return await this.gateway.closeIssue(issueId)
  }

  async reopenIssue(issueId: number) {
    return await this.gateway.reopenIssue(issueId)
  }

  async listLabEventsByDate(date: Date) {
    return await this.gateway.listLabEventsByDate(date)
  }

  async createLabEvent(command: CreateLabEventCommand) {
    return await this.gateway.createLabEvent(command)
  }

  async listLaboratorySchedules() {
    return await this.gateway.listLaboratorySchedules()
  }

  async createLaboratorySchedule(command: CreateLaboratoryScheduleCommand) {
    return await this.gateway.createLaboratorySchedule(command)
  }

  async updateLaboratorySchedule(scheduleId: number, command: UpdateLaboratoryScheduleCommand) {
    return await this.gateway.updateLaboratorySchedule(scheduleId, command)
  }

  async deleteLaboratorySchedule(scheduleId: number) {
    await this.gateway.deleteLaboratorySchedule(scheduleId)
  }

  async listResponsibilities(query?: ListResponsibilitiesQuery) {
    return await this.gateway.listResponsibilities(query)
  }

  async startResponsibility(command: StartResponsibilityCommand) {
    return await this.gateway.startResponsibility(command)
  }

  async canEndResponsibility(actorUserId: number, responsibilityId: number) {
    return await this.gateway.canEndResponsibility(actorUserId, responsibilityId)
  }

  async endResponsibility(responsibilityId: number, notes?: string) {
    return await this.gateway.endResponsibility(responsibilityId, notes)
  }

  async updateResponsibilityNotes(responsibilityId: number, actorUserId: number, notes: string) {
    return await this.gateway.updateResponsibilityNotes(responsibilityId, actorUserId, notes)
  }

  async deleteResponsibility(responsibilityId: number) {
    await this.gateway.deleteResponsibility(responsibilityId)
  }

  async listUserSchedules(query: ListUserSchedulesQuery) {
    return await this.gateway.listUserSchedules(query)
  }

  async getUserSchedule(scheduleId: number) {
    return await this.gateway.getUserSchedule(scheduleId)
  }

  async createUserSchedule(command: CreateUserScheduleCommand) {
    return await this.gateway.createUserSchedule(command)
  }

  async updateUserSchedule(command: UpdateUserScheduleCommand) {
    return await this.gateway.updateUserSchedule(command)
  }

  async deleteUserSchedule(command: DeleteUserScheduleCommand) {
    await this.gateway.deleteUserSchedule(command)
  }
}

export function createLabOperationsModule() {
  return new LabOperationsModule(createLabOperationsGateway())
}
