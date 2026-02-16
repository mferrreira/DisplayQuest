import { WorkSession } from "../models/WorkSession";
import { WorkSessionRepository, IWorkSessionRepository } from "../repositories/WorkSessionRepository";
import { UserRepository } from "../repositories/UserRepository";
import { prisma } from "@/lib/database/prisma";

export class WorkSessionService {
    private workSessionRepo: IWorkSessionRepository;
    private userRepo?: UserRepository;

    constructor(
        workSessionRepo?: IWorkSessionRepository,
        userRepo?: UserRepository,
    ) {
        this.workSessionRepo = workSessionRepo || new WorkSessionRepository();
        this.userRepo = userRepo || new UserRepository();
    }

    async getSessionById(id: number): Promise<WorkSession | null> {
        return await this.workSessionRepo.findById(id);
    }

    async getAllSessions(): Promise<WorkSession[]> {
        return await this.workSessionRepo.findAll();
    }

    async createSession(
        userId: number,
        userName: string,
        activity?: string,
        location?: string,
        projectId?: number
    ): Promise<WorkSession> {
        if (projectId !== undefined && projectId !== null) {
            await this.ensureUserIsProjectMember(userId, projectId);
        }

        // Encerrar automaticamente qualquer sessão ativa existente para este usuário
        const activeSession = await this.workSessionRepo.findActiveByUserId(userId);
        if (activeSession) {
            console.log(`Encerrando sessão ativa ID ${activeSession.id} para usuário ${userId} antes de criar nova sessão`);
            const endTime = new Date();
            const duration = (endTime.getTime() - activeSession.startTime.getTime()) / 1000;
            
            await this.workSessionRepo.update(activeSession.id!, {
                endTime: endTime,
                duration: duration,
                status: 'completed'
            });
        }

        const session = WorkSession.create(userId, userName, activity, location, projectId);
        return await this.workSessionRepo.create(session);
    }

    async updateSession(id: number, userId: number, data: {
        activity?: string;
        location?: string;
        status?: string;
        endTime?: string;
        projectId?: number | null;
        completedTaskIds?: number[];
    }): Promise<WorkSession> {
        const session = await this.workSessionRepo.findById(id);
        if (!session) {
            throw new Error("Sessão não encontrada");
        }
        
        if (session.userId !== userId) {
            throw new Error("Não autorizado a atualizar esta sessão");
        }

        if (data.projectId !== undefined && data.projectId !== null) {
            await this.ensureUserIsProjectMember(userId, data.projectId);
        }

        const targetProjectId = data.projectId !== undefined
            ? data.projectId
            : (session.projectId ?? null);

        let taskIdsToAttach: number[] | undefined;
        if (data.completedTaskIds !== undefined) {
            const willBeCompleted =
                session.isCompleted() ||
                data.status === "completed" ||
                data.endTime !== undefined;

            if (!willBeCompleted) {
                throw new Error("Só é possível vincular tasks em sessões finalizadas");
            }

            taskIdsToAttach = this.normalizeTaskIds(data.completedTaskIds);
            await this.validateCompletedTasksForSession(userId, targetProjectId, taskIdsToAttach);
        }
        
        if (data.endTime !== undefined) {
            session.endSession(new Date(data.endTime));
        } else if (data.status === "completed" && session.isActive()) {
            session.endSession();
        } else if (data.status !== undefined) {
            session.setStatus(data.status);
        }
        
        if (data.activity !== undefined) {
            session.setActivity(data.activity);
        }
        if (data.location !== undefined) {
            session.setLocation(data.location);
        }
        if (data.projectId !== undefined) {
            session.setProjectId(data.projectId);
        }

        const updatedSession = await this.workSessionRepo.update(id, session);

        if (taskIdsToAttach !== undefined) {
            await this.workSessionRepo.replaceSessionTasks(id, taskIdsToAttach);
        }

        return updatedSession;
    }

    async deleteSession(id: number, userId: number): Promise<void> {
        const session = await this.workSessionRepo.findById(id);
        if (!session) {
            throw new Error("Sessão não encontrada");
        }

        if (session.userId !== userId) {
            throw new Error("Não autorizado a excluir esta sessão");
        }

        const sessionData = session.toJSON();
        await this.workSessionRepo.delete(id);
    }

    async getUserSessions(userId: number): Promise<WorkSession[]> {
        return await this.workSessionRepo.findByUserId(userId);
    }

    async getSessionsByStatus(status: string): Promise<WorkSession[]> {
        return await this.workSessionRepo.findByStatus(status);
    }

    private normalizeTaskIds(taskIds: number[]): number[] {
        return Array.from(
            new Set(
                taskIds
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value > 0)
            )
        );
    }

    private async ensureUserIsProjectMember(userId: number, projectId: number): Promise<void> {
        const membership = await prisma.project_members.findUnique({
            where: {
                projectId_userId: {
                    projectId,
                    userId
                }
            },
            select: { id: true }
        });

        if (!membership) {
            throw new Error("Usuário não é membro do projeto informado");
        }
    }

    private async validateCompletedTasksForSession(
        userId: number,
        projectId: number | null,
        taskIds: number[]
    ): Promise<number[]> {
        if (taskIds.length === 0) {
            return [];
        }

        const tasks = await prisma.tasks.findMany({
            where: {
                id: { in: taskIds },
                completed: true,
                assignedTo: userId
            },
            select: {
                id: true,
                projectId: true
            }
        });

        if (tasks.length !== taskIds.length) {
            throw new Error("Uma ou mais tasks informadas não foram concluídas por este usuário");
        }

        if (projectId !== null && tasks.some(task => task.projectId !== projectId)) {
            throw new Error("Todas as tasks vinculadas devem pertencer ao projeto da sessão");
        }

        return tasks.map(task => task.id);
    }
}
