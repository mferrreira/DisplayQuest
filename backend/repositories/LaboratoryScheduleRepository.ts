import { prisma } from '@/lib/database/prisma';
import { LaboratorySchedule } from '../models/LaboratorySchedule';

export interface ILaboratoryScheduleRepository {
    findById(id: number): Promise<LaboratorySchedule | null>;
    findAll(): Promise<LaboratorySchedule[]>;
    create(laboratorySchedule: LaboratorySchedule): Promise<LaboratorySchedule>;
    update(laboratorySchedule: LaboratorySchedule): Promise<LaboratorySchedule>;
    delete(id: number): Promise<void>;
    findByDayOfWeek(dayOfWeek: number): Promise<LaboratorySchedule[]>;
    findByTimeRange(startTime: string, endTime: string): Promise<LaboratorySchedule[]>;
}

export class LaboratoryScheduleRepository implements ILaboratoryScheduleRepository {
    async findById(id: number): Promise<LaboratorySchedule | null> {
        const schedule = await prisma.laboratory_schedules.findUnique({
            where: { id }
        });

        return schedule ? LaboratorySchedule.fromPrisma(schedule) : null;
    }

    async findAll(): Promise<LaboratorySchedule[]> {
        const schedules = await prisma.laboratory_schedules.findMany({
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' }
            ]
        });

        return schedules.map(schedule => LaboratorySchedule.fromPrisma(schedule));
    }

    async create(laboratorySchedule: LaboratorySchedule): Promise<LaboratorySchedule> {
        const errors = this.validateLaboratorySchedule(laboratorySchedule);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = laboratorySchedule.toPrisma();
        const created = await prisma.laboratory_schedules.create({
            data: {
                dayOfWeek: data.dayOfWeek,
                startTime: data.startTime,
                endTime: data.endTime,
                notes: data.notes,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        return LaboratorySchedule.fromPrisma(created);
    }

    async update(laboratorySchedule: LaboratorySchedule): Promise<LaboratorySchedule> {
        if (!laboratorySchedule.id) {
            throw new Error("ID do horário é obrigatório para atualização");
        }

        const errors = this.validateLaboratorySchedule(laboratorySchedule);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = laboratorySchedule.toPrisma();
        const updated = await prisma.laboratory_schedules.update({
            where: { id: laboratorySchedule.id },
            data: {
                dayOfWeek: data.dayOfWeek,
                startTime: data.startTime,
                endTime: data.endTime,
                notes: data.notes,
                updatedAt: new Date()
            }
        });

        return LaboratorySchedule.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.laboratory_schedules.delete({
            where: { id }
        });
    }

    async findByDayOfWeek(dayOfWeek: number): Promise<LaboratorySchedule[]> {
        const schedules = await prisma.laboratory_schedules.findMany({
            where: { dayOfWeek },
            orderBy: { startTime: 'asc' }
        });

        return schedules.map(schedule => LaboratorySchedule.fromPrisma(schedule));
    }

    async findByTimeRange(startTime: string, endTime: string): Promise<LaboratorySchedule[]> {
        const schedules = await prisma.laboratory_schedules.findMany({
            where: {
                startTime: { gte: startTime },
                endTime: { lte: endTime }
            },
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' }
            ]
        });

        return schedules.map(schedule => LaboratorySchedule.fromPrisma(schedule));
    }

    private validateLaboratorySchedule(laboratorySchedule: LaboratorySchedule): string[] {
        const errors: string[] = [];
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

        if (laboratorySchedule.dayOfWeek < 0 || laboratorySchedule.dayOfWeek > 6) errors.push("Dia da semana inválido");
        if (!laboratorySchedule.startTime || !timeRegex.test(laboratorySchedule.startTime)) errors.push("Horário de início inválido");
        if (!laboratorySchedule.endTime || !timeRegex.test(laboratorySchedule.endTime)) errors.push("Horário de fim inválido");

        const [sh, sm] = laboratorySchedule.startTime.split(':').map(Number);
        const [eh, em] = laboratorySchedule.endTime.split(':').map(Number);
        if (sh * 60 + sm >= eh * 60 + em) errors.push("Horário de início deve ser anterior ao fim");

        return errors;
    }
}
