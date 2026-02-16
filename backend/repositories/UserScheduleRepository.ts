import { prisma } from '@/lib/database/prisma';
import { UserSchedule } from '../models/UserSchedule';

export interface IUserScheduleRepository {
    findById(id: number): Promise<UserSchedule | null>;
    findAll(): Promise<UserSchedule[]>;
    create(userSchedule: UserSchedule): Promise<UserSchedule>;
    update(userSchedule: UserSchedule): Promise<UserSchedule>;
    delete(id: number): Promise<void>;
    findByUserId(userId: number): Promise<UserSchedule[]>;
    findByDayOfWeek(dayOfWeek: number): Promise<UserSchedule[]>;
    findActiveByUserId(userId: number): Promise<UserSchedule[]>;
}

export class UserScheduleRepository implements IUserScheduleRepository {
    private getIncludeOptions() {
        return {
            user: true
        };
    }

    async findById(id: number): Promise<UserSchedule | null> {
        const userSchedule = await prisma.user_schedules.findUnique({
            where: { id },
            include: this.getIncludeOptions()
        });

        return userSchedule ? UserSchedule.fromPrisma(userSchedule) : null;
    }

    async findAll(): Promise<UserSchedule[]> {
        const userSchedules = await prisma.user_schedules.findMany({
            include: this.getIncludeOptions(),
            orderBy: [
                { userId: 'asc' },
                { dayOfWeek: 'asc' },
                { startTime: 'asc' }
            ]
        });

        return userSchedules.map(userSchedule => UserSchedule.fromPrisma(userSchedule));
    }

    async create(userSchedule: UserSchedule): Promise<UserSchedule> {
        const errors = this.validateUserSchedule(userSchedule);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = userSchedule.toPrisma();
        const created = await prisma.user_schedules.create({
            data: {
                userId: data.userId,
                dayOfWeek: data.dayOfWeek,
                startTime: data.startTime,
                endTime: data.endTime
            },
            include: this.getIncludeOptions()
        });

        return UserSchedule.fromPrisma(created);
    }

    async update(userSchedule: UserSchedule): Promise<UserSchedule> {
        if (!userSchedule.id) {
            throw new Error("ID do horário é obrigatório para atualização");
        }

        const errors = this.validateUserSchedule(userSchedule);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = userSchedule.toPrisma();
        const updated = await prisma.user_schedules.update({
            where: { id: userSchedule.id },
            data: {
                userId: data.userId,
                dayOfWeek: data.dayOfWeek,
                startTime: data.startTime,
                endTime: data.endTime
            },
            include: this.getIncludeOptions()
        });

        return UserSchedule.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.user_schedules.delete({
            where: { id }
        });
    }

    async findByUserId(userId: number): Promise<UserSchedule[]> {
        const userSchedules = await prisma.user_schedules.findMany({
            where: { userId },
            include: this.getIncludeOptions(),
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' }
            ]
        });

        return userSchedules.map(userSchedule => UserSchedule.fromPrisma(userSchedule));
    }

    async findByDayOfWeek(dayOfWeek: number): Promise<UserSchedule[]> {
        const userSchedules = await prisma.user_schedules.findMany({
            where: { dayOfWeek },
            include: this.getIncludeOptions(),
            orderBy: [
                { userId: 'asc' },
                { startTime: 'asc' }
            ]
        });

        return userSchedules.map(userSchedule => UserSchedule.fromPrisma(userSchedule));
    }

    async findActiveByUserId(userId: number): Promise<UserSchedule[]> {
        const userSchedules = await prisma.user_schedules.findMany({
            where: { 
                userId
            },
            include: this.getIncludeOptions(),
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' }
            ]
        });

        return userSchedules.map(userSchedule => UserSchedule.fromPrisma(userSchedule));
    }

    private validateUserSchedule(userSchedule: UserSchedule): string[] {
        const errors: string[] = [];
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

        if (!userSchedule.userId || userSchedule.userId <= 0) errors.push("ID do usuário é obrigatório");
        if (userSchedule.dayOfWeek < 0 || userSchedule.dayOfWeek > 6) errors.push("Dia da semana inválido");
        if (!userSchedule.startTime || !timeRegex.test(userSchedule.startTime)) errors.push("Horário de início inválido");
        if (!userSchedule.endTime || !timeRegex.test(userSchedule.endTime)) errors.push("Horário de fim inválido");

        const [sh, sm] = userSchedule.startTime.split(':').map(Number);
        const [eh, em] = userSchedule.endTime.split(':').map(Number);
        if (sh * 60 + sm >= eh * 60 + em) errors.push("Horário de início deve ser anterior ao fim");

        return errors;
    }
}
