import { UserSchedule } from '../models/UserSchedule';
import { UserScheduleRepository, IUserScheduleRepository } from '../repositories/UserScheduleRepository';
import { UserRepository } from '../repositories/UserRepository';
import { createIdentityAccessModule, IdentityAccessModule } from '@/backend/modules/identity-access';

export interface IUserScheduleService {
    findById(id: number): Promise<UserSchedule | null>;
    findAll(): Promise<UserSchedule[]>;
    create(data: Omit<UserSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserSchedule>;
    update(id: number, data: Partial<UserSchedule>): Promise<UserSchedule>;
    delete(id: number): Promise<void>;
    getSchedulesByUser(userId: number): Promise<UserSchedule[]>;
}

export class UserScheduleService implements IUserScheduleService {
    private identityAccess: IdentityAccessModule;

    constructor(
        private userScheduleRepo: IUserScheduleRepository,
        private userRepo: UserRepository,
    ) {
        this.identityAccess = createIdentityAccessModule();
    }

    async findById(id: number): Promise<UserSchedule | null> {
        return await this.userScheduleRepo.findById(id);
    }

    async findAll(): Promise<UserSchedule[]> {
        return await this.userScheduleRepo.findAll();
    }

    async create(data: Omit<UserSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserSchedule> {
        const user = await this.userRepo.findById(data.userId);
        if (!user) {
            throw new Error("Usuário não encontrado");
        }

        const canManage = await this.canUserManageSchedule(data.userId, data.userId);
        if (!canManage) {
            throw new Error("Usuário não tem permissão para gerenciar este horário");
        }

        const userSchedule = UserSchedule.create(data);
        const created = await this.userScheduleRepo.create(userSchedule);


        return created;
    }

    async update(id: number, data: Partial<UserSchedule>): Promise<UserSchedule> {
        const existingSchedule = await this.userScheduleRepo.findById(id);
        if (!existingSchedule) {
            throw new Error("Horário não encontrado");
        }

        const canManage = await this.canUserManageSchedule(data.userId || existingSchedule.userId, existingSchedule.userId);
        if (!canManage) {
            throw new Error("Usuário não tem permissão para gerenciar este horário");
        }

        const oldData = existingSchedule.toJSON();

        if (data.startTime !== undefined || data.endTime !== undefined) {
            existingSchedule.updateSchedule(
                data.startTime || existingSchedule.startTime,
                data.endTime || existingSchedule.endTime
            );
        }

        const updated = await this.userScheduleRepo.update(existingSchedule);

        return updated;
    }

    async delete(id: number): Promise<void> {
        const schedule = await this.userScheduleRepo.findById(id);
        if (!schedule) {
            throw new Error("Horário não encontrado");
        }

        const scheduleData = schedule.toJSON();
        await this.userScheduleRepo.delete(id);

    }

    async getSchedulesByUser(userId: number): Promise<UserSchedule[]> {
        return await this.userScheduleRepo.findByUserId(userId);
    }

    async canUserManageSchedule(userId: number, targetUserId?: number): Promise<boolean> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            return false;
        }

        if (this.identityAccess.hasAnyRole(user.roles, ['COORDENADOR'])) {
            return true;
        }

        if (!targetUserId || userId === targetUserId) {
            return true;
        }

        return false;
    }
}
