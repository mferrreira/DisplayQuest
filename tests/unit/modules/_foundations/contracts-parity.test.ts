// @vitest-environment node
/**
 * ONDA 0 / batch 0.4 — drift guard for the type swap.
 *
 * Batch 0.4 moved the contracts/ports of several modules from `@/backend/models/*` to
 * `@/backend/domain`, "mantendo mesma forma" (PLAN §5 batch 0.4). A duplicated shape drifts;
 * an assignment does not. Each case below asks the compiler to accept the REAL class the
 * adapters produce as the domain contract the ports declare. If someone narrows a field in
 * either place, tsc goes red here instead of a route going red at runtime.
 *
 * These are constructor calls with the minimum arguments each class accepts — no DB, no mock.
 */
import { describe, expect, it } from "vitest";
import { Badge as BadgeModel, UserBadge as UserBadgeModel } from "@/backend/models/Badge";
import { DailyLog as DailyLogModel } from "@/backend/models/DailyLog";
import { Issue as IssueModel } from "@/backend/models/Issue";
import { LabEvent as LabEventModel } from "@/backend/models/LabEvent";
import { LabNotice as LabNoticeModel } from "@/backend/models/LabNotice";
import { LabResponsibility as LabResponsibilityModel } from "@/backend/models/LabResponsibility";
import { Project as ProjectModel } from "@/backend/models/Project";
import { UserSchedule as UserScheduleModel } from "@/backend/models/UserSchedule";
import { WorkSession as WorkSessionModel } from "@/backend/models/WorkSession";
import { Task as TaskModel } from "@/backend/models/Task";
import type {
  Badge,
  DailyLog,
  Issue,
  ITask,
  LabEvent,
  LabNotice,
  LabResponsibility,
  LaboratorySchedule,
  Project,
  Task,
  UserBadge,
  UserSchedule,
  WorkSession,
} from "@/backend/domain";
import { ProjectStatus } from "@/backend/domain";
import { LaboratorySchedule as LaboratoryScheduleModel } from "@/backend/models/LaboratorySchedule";

describe("domain contracts accept what the current adapters produce", () => {
  it("WorkSession", () => {
    const model: WorkSession = new WorkSessionModel(1, "Lia");
    expect(model.userId).toBe(1);
    expect(typeof model.status).toBe("string");
  });

  it("DailyLog", () => {
    const model: DailyLog = new DailyLogModel(1, new Date());
    expect(model.userId).toBe(1);
  });

  it("Task / ITask", () => {
    const created: Task = TaskModel.create({
      title: "Titulo",
      priority: "medium",
      points: 10,
      status: "to-do",
      completed: false,
      taskVisibility: "public",
    });
    const input: ITask = { title: "Titulo", status: "to-do", priority: "low", points: 0, completed: false, taskVisibility: "private" };
    expect(created.title).toBe("Titulo");
    expect(typeof created.toJSON).toBe("function");
    expect(input.status).toBe("to-do");
  });

  it("Project", () => {
    const model: Project = new ProjectModel({
      name: "Lab",
      createdBy: 2,
      createdAt: "2026-01-01",
      status: ProjectStatus.ACTIVE,
    });
    expect(model.name).toBe("Lab");
  });

  it("Badge / UserBadge", () => {
    const badge: Badge = new BadgeModel({ name: "Primeira quest", description: "", category: "milestone", isActive: true, createdBy: 2 });
    const userBadge: UserBadge = new UserBadgeModel({ userId: 2, badgeId: 3 });
    expect(badge.name).toBe("Primeira quest");
    expect(userBadge.userId).toBe(2);
  });

  it("Issue", () => {
    const model: Issue = new IssueModel({ title: "Sensor falhou", description: "x", status: "open", priority: "high", reporterId: 2 });
    expect(model.status).toBe("open");
  });

  it("LabEvent / LabNotice / schedules / responsibility", () => {
    const event: LabEvent = new LabEventModel({ userId: 2, userName: "Lia", date: new Date(), note: "reuniao" });
    const notice: LabNotice = new LabNoticeModel({ userId: 2, userName: "Lia", note: "aviso" });
    const labSchedule: LaboratorySchedule = new LaboratoryScheduleModel({ dayOfWeek: 1, startTime: "08:00", endTime: "12:00" });
    const userSchedule: UserSchedule = new UserScheduleModel({ userId: 2, dayOfWeek: 3, startTime: "09:00", endTime: "11:00" });
    const responsibility: LabResponsibility = new LabResponsibilityModel({ userId: 2, userName: "Lia", startTime: new Date() });
    expect(event.note).toBe("reuniao");
    expect(notice.note).toBe("aviso");
    expect(labSchedule.dayOfWeek).toBe(1);
    expect(userSchedule.dayOfWeek).toBe(3);
    expect(responsibility.pausedAt).toBeNull();
    expect(responsibility.totalPausedMs).toBe(0);
  });

  it("the ports' method-shaped contracts are still satisfied by the model classes", () => {
    // `toJSON()` is part of the contract because the HTTP adapters read it (batch 0.4 finding,
    // DEC-12). Removing it from the domain type must break here, not in a route.
    const withToJson: Array<{ toJSON(): any }> = [
      new TaskModel({ title: "t", status: "to-do", priority: "low", points: 0, completed: false, taskVisibility: "public" }),
      new IssueModel({ title: "t", description: "d", status: "open", priority: "low", reporterId: 1 }),
      new LabEventModel({ userId: 1, userName: "u", date: new Date(), note: "n" }),
      new LabNoticeModel({ userId: 1, userName: "u", note: "n" }),
      new LaboratoryScheduleModel({ dayOfWeek: 0, startTime: "08:00", endTime: "09:00" }),
      new UserScheduleModel({ userId: 1, dayOfWeek: 0, startTime: "08:00", endTime: "09:00" }),
      new LabResponsibilityModel({ userId: 1, userName: "u", startTime: new Date() }),
    ];
    expect(withToJson).toHaveLength(7);
    for (const entity of withToJson) {
      expect(typeof entity.toJSON).toBe("function");
    }
  });
});
