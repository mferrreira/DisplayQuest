import type { LabOperationsGateway } from "@/backend/modules/lab-operations/application/ports/lab-operations.gateway"
import {
  createLabOperationsGateway,
  type LabOperationsGatewayDependencies,
} from "@/backend/modules/lab-operations/infrastructure/lab-operations.gateway"
import { createNotificationsModule } from "@/backend/modules/notifications"
import { createIdentityAccessModule } from "@/backend/modules/identity-access"

type GatewayCall<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never

export class LabOperationsModule {
  readonly listIssues: GatewayCall<LabOperationsGateway["listIssues"]>
  readonly getIssue: GatewayCall<LabOperationsGateway["getIssue"]>
  readonly createIssue: GatewayCall<LabOperationsGateway["createIssue"]>
  readonly updateIssue: GatewayCall<LabOperationsGateway["updateIssue"]>
  readonly deleteIssue: GatewayCall<LabOperationsGateway["deleteIssue"]>
  readonly assignIssue: GatewayCall<LabOperationsGateway["assignIssue"]>
  readonly unassignIssue: GatewayCall<LabOperationsGateway["unassignIssue"]>
  readonly startIssueProgress: GatewayCall<LabOperationsGateway["startIssueProgress"]>
  readonly resolveIssue: GatewayCall<LabOperationsGateway["resolveIssue"]>
  readonly closeIssue: GatewayCall<LabOperationsGateway["closeIssue"]>
  readonly reopenIssue: GatewayCall<LabOperationsGateway["reopenIssue"]>
  readonly listLabEventsByDate: GatewayCall<LabOperationsGateway["listLabEventsByDate"]>
  readonly createLabEvent: GatewayCall<LabOperationsGateway["createLabEvent"]>
  readonly listLaboratorySchedules: GatewayCall<LabOperationsGateway["listLaboratorySchedules"]>
  readonly createLaboratorySchedule: GatewayCall<LabOperationsGateway["createLaboratorySchedule"]>
  readonly updateLaboratorySchedule: GatewayCall<LabOperationsGateway["updateLaboratorySchedule"]>
  readonly deleteLaboratorySchedule: GatewayCall<LabOperationsGateway["deleteLaboratorySchedule"]>
  readonly listResponsibilities: GatewayCall<LabOperationsGateway["listResponsibilities"]>
  readonly startResponsibility: GatewayCall<LabOperationsGateway["startResponsibility"]>
  readonly canEndResponsibility: GatewayCall<LabOperationsGateway["canEndResponsibility"]>
  readonly endResponsibility: GatewayCall<LabOperationsGateway["endResponsibility"]>
  readonly updateResponsibilityNotes: GatewayCall<LabOperationsGateway["updateResponsibilityNotes"]>
  readonly deleteResponsibility: GatewayCall<LabOperationsGateway["deleteResponsibility"]>
  readonly listUserSchedules: GatewayCall<LabOperationsGateway["listUserSchedules"]>
  readonly getUserSchedule: GatewayCall<LabOperationsGateway["getUserSchedule"]>
  readonly createUserSchedule: GatewayCall<LabOperationsGateway["createUserSchedule"]>
  readonly updateUserSchedule: GatewayCall<LabOperationsGateway["updateUserSchedule"]>
  readonly deleteUserSchedule: GatewayCall<LabOperationsGateway["deleteUserSchedule"]>

  constructor(private readonly gateway: LabOperationsGateway) {
    this.listIssues = this.gateway.listIssues.bind(this.gateway)
    this.getIssue = this.gateway.getIssue.bind(this.gateway)
    this.createIssue = this.gateway.createIssue.bind(this.gateway)
    this.updateIssue = this.gateway.updateIssue.bind(this.gateway)
    this.deleteIssue = this.gateway.deleteIssue.bind(this.gateway)
    this.assignIssue = this.gateway.assignIssue.bind(this.gateway)
    this.unassignIssue = this.gateway.unassignIssue.bind(this.gateway)
    this.startIssueProgress = this.gateway.startIssueProgress.bind(this.gateway)
    this.resolveIssue = this.gateway.resolveIssue.bind(this.gateway)
    this.closeIssue = this.gateway.closeIssue.bind(this.gateway)
    this.reopenIssue = this.gateway.reopenIssue.bind(this.gateway)
    this.listLabEventsByDate = this.gateway.listLabEventsByDate.bind(this.gateway)
    this.createLabEvent = this.gateway.createLabEvent.bind(this.gateway)
    this.listLaboratorySchedules = this.gateway.listLaboratorySchedules.bind(this.gateway)
    this.createLaboratorySchedule = this.gateway.createLaboratorySchedule.bind(this.gateway)
    this.updateLaboratorySchedule = this.gateway.updateLaboratorySchedule.bind(this.gateway)
    this.deleteLaboratorySchedule = this.gateway.deleteLaboratorySchedule.bind(this.gateway)
    this.listResponsibilities = this.gateway.listResponsibilities.bind(this.gateway)
    this.startResponsibility = this.gateway.startResponsibility.bind(this.gateway)
    this.canEndResponsibility = this.gateway.canEndResponsibility.bind(this.gateway)
    this.endResponsibility = this.gateway.endResponsibility.bind(this.gateway)
    this.updateResponsibilityNotes = this.gateway.updateResponsibilityNotes.bind(this.gateway)
    this.deleteResponsibility = this.gateway.deleteResponsibility.bind(this.gateway)
    this.listUserSchedules = this.gateway.listUserSchedules.bind(this.gateway)
    this.getUserSchedule = this.gateway.getUserSchedule.bind(this.gateway)
    this.createUserSchedule = this.gateway.createUserSchedule.bind(this.gateway)
    this.updateUserSchedule = this.gateway.updateUserSchedule.bind(this.gateway)
    this.deleteUserSchedule = this.gateway.deleteUserSchedule.bind(this.gateway)
  }
}

export interface LabOperationsModuleFactoryOptions {
  gateway?: LabOperationsGateway
  gatewayDependencies?: Partial<LabOperationsGatewayDependencies>
}

export function createLabOperationsModule(options: LabOperationsModuleFactoryOptions = {}) {
  const gateway = options.gateway ?? createLabOperationsGateway({
    notificationsModule: createNotificationsModule(),
    identityAccess: createIdentityAccessModule(),
    ...options.gatewayDependencies,
  })

  return new LabOperationsModule(gateway)
}
