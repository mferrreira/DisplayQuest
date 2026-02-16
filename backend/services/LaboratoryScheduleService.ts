import { LaboratorySchedule } from '../models/LaboratorySchedule';
import { LaboratoryScheduleRepository, ILaboratoryScheduleRepository } from '../repositories/LaboratoryScheduleRepository';
import { UserRepository } from '../repositories/UserRepository';
import { createIdentityAccessModule, IdentityAccessModule } from '@/backend/modules/identity-access';

export interface ILaboratoryScheduleService {
    findById(id: number): Promise<LaboratorySchedule | null>;
    findAll(): Promise<LaboratorySchedule[]>;
    create(data: Omit<LaboratorySchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<LaboratorySchedule>;
    update(id: number, data: Partial<LaboratorySchedule>): Promise<LaboratorySchedule>;
    delete(id: number): Promise<void>;
    getSchedulesByDay(dayOfWeek: number): Promise<LaboratorySchedule[]>;
    getSchedulesByTimeRange(startTime: string, endTime: string): Promise<LaboratorySchedule[]>;
    canUserManageSchedule(userId: number): Promise<boolean>;
}

export class LaboratoryScheduleService implements ILaboratoryScheduleService {
    private identityAccess: IdentityAccessModule;

    constructor(
        private laboratoryScheduleRepo: ILaboratoryScheduleRepository,
        private userRepo: UserRepository,
    ) {
        this.identityAccess = createIdentityAccessModule();
    }

    async findById(id: number): Promise<LaboratorySchedule | null> {
        return await this.laboratoryScheduleRepo.findById(id);
    }

    async findAll(): Promise<LaboratorySchedule[]> {
        return await this.laboratoryScheduleRepo.findAll();
    }

    async create(data: Omit<LaboratorySchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<LaboratorySchedule> {
        const canManage = await this.canUserManageSchedule(data.userId! || 0);
        if (!canManage) {
            throw new Error("Usuário não tem permissão para gerenciar horários do laboratório");
        }

        const laboratorySchedule = LaboratorySchedule.create(data);
        return await this.laboratoryScheduleRepo.create(laboratorySchedule);
    }

    async update(id: number, data: Partial<LaboratorySchedule>): Promise<LaboratorySchedule> {
        const existingSchedule = await this.laboratoryScheduleRepo.findById(id);
        if (!existingSchedule) {
            throw new Error("Horário do laboratório não encontrado");
        }

        const canManage = await this.canUserManageSchedule(data.userId! || 0);
        if (!canManage) {
            throw new Error("Usuário não tem permissão para gerenciar horários do laboratório");
        }

        if (data.startTime !== undefined || data.endTime !== undefined || data.notes !== undefined) {
            existingSchedule.updateSchedule(
                data.startTime || existingSchedule.startTime,
                data.endTime || existingSchedule.endTime,
                data.notes!
            );
        }

        return await this.laboratoryScheduleRepo.update(existingSchedule);
    }

    async delete(id: number): Promise<void> {
        const existingSchedule = await this.laboratoryScheduleRepo.findById(id);
        if (!existingSchedule) {
            throw new Error("Horário do laboratório não encontrado");
        }

        await this.laboratoryScheduleRepo.delete(id);
    }

    async getSchedulesByDay(dayOfWeek: number): Promise<LaboratorySchedule[]> {
        return await this.laboratoryScheduleRepo.findByDayOfWeek(dayOfWeek);
    }

    async getSchedulesByTimeRange(startTime: string, endTime: string): Promise<LaboratorySchedule[]> {
        return await this.laboratoryScheduleRepo.findByTimeRange(startTime, endTime);
    }

    async canUserManageSchedule(userId: number): Promise<boolean> {
        if (userId === 0) return false;

        const user = await this.userRepo.findById(userId);
        if (!user) return false;

        const hasPermission = this.identityAccess.hasAnyRole(user.roles, ['COORDENADOR', 'GERENTE', 'LABORATORISTA']);

        return hasPermission;
    }
}
