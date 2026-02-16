import { prisma } from "@/lib/database/prisma";
import { work_sessions } from '@prisma/client';
import { WorkSession } from "../models/WorkSession";

export interface IWorkSessionRepository {
    create(session: WorkSession): Promise<WorkSession>;
    findById(id: number): Promise<WorkSession | null>;
    findByUserId(userId: number): Promise<WorkSession[]>;
    findActiveByUserId(userId: number): Promise<WorkSession | null>;
    findByUserIdAndDateRange(userId: number, startDate: Date, endDate: Date): Promise<WorkSession[]>;
    update(id: number, session: Partial<WorkSession>): Promise<WorkSession>;
    delete(id: number): Promise<void>;
    findAll(): Promise<WorkSession[]>;
    findByStatus(status: string): Promise<WorkSession[]>;
    endAllActiveSessions(): Promise<void>;
    getUserTotalHours(userId: number): Promise<number>;
    getUserTotalHoursInPeriod(userId: number, startDate: Date, endDate: Date): Promise<number>;
    getActiveSessionsCount(): Promise<number>;
    replaceSessionTasks(sessionId: number, taskIds: number[]): Promise<void>;
    getSessionTaskIds(sessionId: number): Promise<number[]>;
}

export class WorkSessionRepository implements IWorkSessionRepository {
    
    async create(session: WorkSession): Promise<WorkSession> {
        const data = session.toPrisma();
        const created = await prisma.work_sessions.create({
            data
        });
        return WorkSession.fromPrisma(created);
    }

    async findById(id: number): Promise<WorkSession | null> {
        const session = await prisma.work_sessions.findUnique({
            where: { id }
        });
        return session ? WorkSession.fromPrisma(session) : null;
    }

    async findByUserId(userId: number): Promise<WorkSession[]> {
        const sessions = await prisma.work_sessions.findMany({
            where: { userId },
            orderBy: { startTime: 'desc' }
        });
        return sessions.map(session => WorkSession.fromPrisma(session));
    }

    async findActiveByUserId(userId: number): Promise<WorkSession | null> {
        const session = await prisma.work_sessions.findFirst({
            where: {
                userId,
                status: 'active'
            },
            orderBy: { startTime: 'desc' }
        });
        return session ? WorkSession.fromPrisma(session) : null;
    }

    async findByUserIdAndDateRange(userId: number, startDate: Date, endDate: Date): Promise<WorkSession[]> {
        const sessions = await prisma.work_sessions.findMany({
            where: {
                userId,
                startTime: {
                    gte: startDate,
                    lte: endDate
                }
            },
            orderBy: { startTime: 'desc' }
        });
        return sessions.map(session => WorkSession.fromPrisma(session));
    }

    async update(id: number, updates: Partial<WorkSession>): Promise<WorkSession> {
        // Convert WorkSession properties to Prisma format
        const updateData: Partial<work_sessions> = {};
        
        if (updates.activity !== undefined) updateData.activity = updates.activity;
        if (updates.location !== undefined) updateData.location = updates.location;
        if (updates.endTime !== undefined) updateData.endTime = updates.endTime;
        if (updates.duration !== undefined) updateData.duration = updates.duration;
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.projectId !== undefined) updateData.projectId = updates.projectId;

        const updated = await prisma.work_sessions.update({
            where: { id },
            data: updateData
        });
        return WorkSession.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.work_sessions.delete({
            where: { id }
        });
    }

    async findAll(): Promise<WorkSession[]> {
        const sessions = await prisma.work_sessions.findMany({
            orderBy: { startTime: 'desc' }
        });
        return sessions.map(session => WorkSession.fromPrisma(session));
    }

    async findByStatus(status: string): Promise<WorkSession[]> {
        const sessions = await prisma.work_sessions.findMany({
            where: { status },
            orderBy: { startTime: 'desc' }
        });
        return sessions.map(session => WorkSession.fromPrisma(session));
    }

    async endAllActiveSessions(): Promise<void> {
        const endTime = new Date();
        
        // Find all active sessions and calculate their durations
        const activeSessions = await prisma.work_sessions.findMany({
            where: { status: 'active' }
        });

        for (const session of activeSessions) {
            const diffMs = endTime.getTime() - session.startTime.getTime();
            const duration = diffMs / 1000;

            await prisma.work_sessions.update({
                where: { id: session.id },
                data: {
                    endTime,
                    duration,
                    status: 'completed'
                }
            });
        }
    }

    // Statistics methods
    async getUserTotalHours(userId: number): Promise<number> {
        const result = await prisma.work_sessions.aggregate({
            where: {
                userId,
                status: 'completed',
                duration: { not: null }
            },
            _sum: {
                duration: true
            }
        });
        return result._sum.duration || 0;
    }

    async getUserTotalHoursInPeriod(userId: number, startDate: Date, endDate: Date): Promise<number> {
        const result = await prisma.work_sessions.aggregate({
            where: {
                userId,
                status: 'completed',
                duration: { not: null },
                startTime: {
                    gte: startDate,
                    lte: endDate
                }
            },
            _sum: {
                duration: true
            }
        });
        return result._sum.duration || 0;
    }

    async getActiveSessionsCount(): Promise<number> {
        return await prisma.work_sessions.count({
            where: { status: 'active' }
        });
    }

    async replaceSessionTasks(sessionId: number, taskIds: number[]): Promise<void> {
        await prisma.$transaction(async (tx) => {
            await tx.work_session_tasks.deleteMany({
                where: { workSessionId: sessionId }
            });

            if (taskIds.length > 0) {
                await tx.work_session_tasks.createMany({
                    data: taskIds.map(taskId => ({
                        workSessionId: sessionId,
                        taskId
                    })),
                    skipDuplicates: true
                });
            }
        });
    }

    async getSessionTaskIds(sessionId: number): Promise<number[]> {
        const sessionTasks = await prisma.work_session_tasks.findMany({
            where: { workSessionId: sessionId },
            select: { taskId: true }
        });

        return sessionTasks.map(item => item.taskId);
    }
}
