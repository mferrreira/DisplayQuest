import { purchases } from '@prisma/client';

export interface IPurchase {
    id?: number;
    userId: number;
    rewardId: number;
    rewardName: string;
    price: number;
    purchaseDate: Date;
    status: PurchaseStatus;
}

export type PurchaseStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export class Purchase {
    public id?: number;
    public userId: number;
    public rewardId: number;
    public rewardName: string;
    public price: number;
    public purchaseDate: Date;
    public status: PurchaseStatus;

    constructor(
        userId: number,
        rewardId: number,
        rewardName: string,
        price: number,
        purchaseDate: Date,
        status: PurchaseStatus = 'pending',
        id?: number,
    ) {
        this.id = id;
        this.userId = userId;
        this.rewardId = rewardId;
        this.rewardName = rewardName;
        this.price = price;
        this.purchaseDate = purchaseDate;
        this.status = status;
    }

    static fromPrisma(data: purchases): Purchase {
        return new Purchase(
            data.userId,
            data.rewardId,
            data.rewardName,
            data.price,
            new Date(data.purchaseDate),
            data.status as PurchaseStatus,
            data.id,
        );
    }

    toPrisma(): any {
        const data: any = {
            userId: this.userId,
            rewardId: this.rewardId,
            rewardName: this.rewardName,
            price: this.price,
            purchaseDate: this.purchaseDate.toISOString(),
            status: this.status,
        };

        if (this.id !== undefined) data.id = this.id;
        return data;
    }

    static create(data: IPurchase): Purchase {
        return new Purchase(
            data.userId,
            data.rewardId,
            data.rewardName,
            data.price,
            data.purchaseDate,
            data.status,
            data.id,
        );
    }
}
