import { PurchaseRepository } from '../repositories/PurchaseRepository';
import { RewardRepository } from '../repositories/RewardRepository';
import { Purchase } from '../models/Purchase';
import { Reward } from '../models/Reward';
import { prisma } from '@/lib/database/prisma';

export class PurchaseService {
    constructor(
        private purchaseRepo: PurchaseRepository,
        private rewardRepo: RewardRepository
    ) {}

    async findById(id: number): Promise<Purchase | null> {
        return await this.purchaseRepo.findById(id);
    }

    async findAll(): Promise<Purchase[]> {
        return await this.purchaseRepo.findAll();
    }

    async create(data: any): Promise<Purchase> {
        if (!data.userId || !data.rewardId) {
            throw new Error("userId e rewardId são obrigatórios");
        }

        const userId = Number(data.userId);
        const rewardId = Number(data.rewardId);
        if (!Number.isInteger(userId) || !Number.isInteger(rewardId)) {
            throw new Error("userId e rewardId inválidos");
        }

        const user = await this.purchaseRepo.findUserById(userId);
        if (!user) {
            throw new Error("Usuário não encontrado");
        }


        const reward = await this.rewardRepo.findById(rewardId);
        if (!reward) {
            throw new Error("Recompensa não encontrada");
        }


        if (!reward.canBePurchased(user.points)) {
            throw new Error(reward.getPurchaseValidationMessage(user.points));
        }


        const purchase = Purchase.create({
            userId,
            rewardId,
            rewardName: reward.name,
            price: reward.price,
            purchaseDate: new Date(),
            status: 'pending'
        });

        if (!purchase.isValid()) {
            throw new Error("Dados inválidos para a compra");
        }

        const created = await prisma.$transaction(async (tx) => {
            const currentUser = await tx.users.findUnique({
                where: { id: userId },
                select: { id: true, points: true },
            });

            if (!currentUser) {
                throw new Error("Usuário não encontrado");
            }

            if (currentUser.points < reward.price) {
                throw new Error(reward.getPurchaseValidationMessage(currentUser.points));
            }

            await tx.users.update({
                where: { id: userId },
                data: {
                    points: {
                        decrement: reward.price,
                    },
                },
            });

            return await tx.purchases.create({
                data: purchase.toPrisma(),
                include: { user: true, reward: true },
            });
        });

        return Purchase.fromPrisma(created);
    }

    async update(id: number, data: Partial<Purchase>): Promise<Purchase> {
        const currentPurchase = await this.purchaseRepo.findById(id);
        if (!currentPurchase) {
            throw new Error("Compra não encontrada");
        }


        Object.assign(currentPurchase, data);

        if (!currentPurchase.isValid()) {
            throw new Error("Dados inválidos para atualização");
        }

        return await this.purchaseRepo.update(currentPurchase);
    }

    async delete(id: number): Promise<void> {
        const purchase = await this.purchaseRepo.findById(id);
        if (!purchase) {
            throw new Error("Compra não encontrada");
        }

        await this.purchaseRepo.delete(id);
    }

    async findByUserId(userId: number): Promise<Purchase[]> {
        return await this.purchaseRepo.findByUserId(userId);
    }

    async findByRewardId(rewardId: number): Promise<Purchase[]> {
        return await this.purchaseRepo.findByRewardId(rewardId);
    }

    async findByStatus(status: string): Promise<Purchase[]> {
        return await this.purchaseRepo.findByStatus(status);
    }

    async findPending(): Promise<Purchase[]> {
        return await this.purchaseRepo.findPending();
    }

    async findApproved(): Promise<Purchase[]> {
        return await this.purchaseRepo.findApproved();
    }

    async findCompleted(): Promise<Purchase[]> {
        return await this.purchaseRepo.findCompleted();
    }

    async findRejected(): Promise<Purchase[]> {
        return await this.purchaseRepo.findRejected();
    }


    async approvePurchase(id: number): Promise<Purchase> {
        const purchase = await this.purchaseRepo.findById(id);
        if (!purchase) {
            throw new Error("Compra não encontrada");
        }

        if (!purchase.canBeApproved()) {
            throw new Error("Apenas compras pendentes podem ser aprovadas");
        }

        purchase.approve();
        return await this.purchaseRepo.update(purchase);
    }

    async rejectPurchase(id: number): Promise<Purchase> {
        const purchase = await this.purchaseRepo.findById(id);
        if (!purchase) {
            throw new Error("Compra não encontrada");
        }

        if (!purchase.canBeRejected()) {
            throw new Error("Apenas compras pendentes podem ser rejeitadas");
        }

        const shouldRefund = purchase.status === 'pending';
        purchase.reject();
        const updatedPurchase = await this.purchaseRepo.update(purchase);

        if (shouldRefund) {
            await this.refundPoints(purchase.userId, purchase.price);
        }

        return updatedPurchase;
    }

    async completePurchase(id: number): Promise<Purchase> {
        const purchase = await this.purchaseRepo.findById(id);
        if (!purchase) {
            throw new Error("Compra não encontrada");
        }

        if (!purchase.canBeCompleted()) {
            throw new Error("Apenas compras aprovadas podem ser completadas");
        }

        purchase.complete();
        return await this.purchaseRepo.update(purchase);
    }

    async cancelPurchase(id: number): Promise<Purchase> {
        const purchase = await this.purchaseRepo.findById(id);
        if (!purchase) {
            throw new Error("Compra não encontrada");
        }

        if (!purchase.canBeCancelled()) {
            throw new Error("Compras completadas não podem ser canceladas");
        }

        const shouldRefund = purchase.status === 'pending' || purchase.status === 'approved';
        purchase.cancel();
        const updatedPurchase = await this.purchaseRepo.update(purchase);

        if (shouldRefund) {
            await this.refundPoints(purchase.userId, purchase.price);
        }

        return updatedPurchase;
    }

    private async refundPoints(userId: number, points: number): Promise<void> {
        await prisma.users.update({
            where: { id: userId },
            data: {
                points: {
                    increment: points,
                },
            },
        });
    }

    async getPurchaseStatistics(): Promise<{
        totalPurchases: number;
        pendingPurchases: number;
        approvedPurchases: number;
        completedPurchases: number;
        rejectedPurchases: number;
        totalPointsSpent: number;
        averagePurchaseValue: number;
    }> {
        return await this.purchaseRepo.getPurchaseStatistics();
    }

    async getUserPurchaseStatistics(userId: number): Promise<{
        totalPurchases: number;
        totalPointsSpent: number;
        averagePurchaseValue: number;
        lastPurchaseDate: Date | null;
    }> {
        return await this.purchaseRepo.getUserPurchaseStatistics(userId);
    }

    async getRewardPurchaseStatistics(rewardId: number): Promise<{
        totalPurchases: number;
        totalPointsEarned: number;
        averagePurchaseValue: number;
        lastPurchaseDate: Date | null;
    }> {
        return await this.purchaseRepo.getRewardPurchaseStatistics(rewardId);
    }

    async searchPurchases(query: {
        userId?: number;
        rewardId?: number;
        status?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<Purchase[]> {
        let purchases: Purchase[] = [];

        if (query.userId) {
            purchases = await this.purchaseRepo.findByUserId(query.userId);
        } else if (query.rewardId) {
            purchases = await this.purchaseRepo.findByRewardId(query.rewardId);
        } else if (query.status) {
            purchases = await this.purchaseRepo.findByStatus(query.status);
        } else {
            purchases = await this.purchaseRepo.findAll();
        }

        if (query.startDate && query.endDate) {
            purchases = purchases.filter(purchase => 
                purchase.purchaseDate >= query.startDate! && 
                purchase.purchaseDate <= query.endDate!
            );
        }

        return purchases;
    }


    async bulkApprovePurchases(purchaseIds: number[]): Promise<Purchase[]> {
        const approvedPurchases: Purchase[] = [];

        for (const id of purchaseIds) {
            try {
                const purchase = await this.approvePurchase(id);
                approvedPurchases.push(purchase);
            } catch (error) {
                console.error(`Failed to approve purchase ${id}:`, error);
            }
        }

        return approvedPurchases;
    }

    async bulkRejectPurchases(purchaseIds: number[]): Promise<Purchase[]> {
        const rejectedPurchases: Purchase[] = [];

        for (const id of purchaseIds) {
            try {
                const purchase = await this.rejectPurchase(id);
                rejectedPurchases.push(purchase);
            } catch (error) {
                console.error(`Failed to reject purchase ${id}:`, error);
            }
        }

        return rejectedPurchases;
    }


    async validatePurchaseCreation(userId: number, rewardId: number): Promise<{
        canPurchase: boolean;
        message: string;
        user?: any;
        reward?: Reward;
    }> {
        const user = await this.purchaseRepo.findUserById(userId);
        if (!user) {
            return {
                canPurchase: false,
                message: "Usuário não encontrado"
            };
        }

        const reward = await this.rewardRepo.findById(rewardId);
        if (!reward) {
            return {
                canPurchase: false,
                message: "Recompensa não encontrada",
                user
            };
        }

        const canPurchase = reward.canBePurchased(user.points);
        const message = reward.getPurchaseValidationMessage(user.points);

        return {
            canPurchase,
            message,
            user,
            reward
        };
    }
}
