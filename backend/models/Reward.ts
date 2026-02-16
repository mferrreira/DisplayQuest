import { rewards } from '@prisma/client';

export interface IReward {
    id?: number;
    name: string;
    description?: string | null;
    price: number;
    available: boolean;
    categoryId?: number | null;
    stock?: number | null;
    imageUrl?: string | null;
}

export class Reward {
    public id?: number;
    public name: string;
    public description?: string | null;
    public price: number;
    public available: boolean;
    public categoryId?: number | null;
    public stock?: number | null;
    public imageUrl?: string | null;

    constructor(
        name: string,
        price: number,
        available: boolean = true,
        description?: string | null,
        categoryId?: number | null,
        stock?: number | null,
        imageUrl?: string | null,
        id?: number,
    ) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.available = available;
        this.categoryId = categoryId;
        this.stock = stock;
        this.imageUrl = imageUrl;
    }

    static fromPrisma(data: rewards): Reward {
        return new Reward(
            data.name,
            data.price,
            data.available,
            data.description,
            null,
            null,
            null,
            data.id,
        );
    }

    toPrisma(): any {
        const data: any = {
            name: this.name,
            price: this.price,
            available: this.available,
        };

        if (this.description !== undefined) data.description = this.description;
        if (this.categoryId !== undefined) data.categoryId = this.categoryId;
        if (this.stock !== undefined) data.stock = this.stock;
        if (this.imageUrl !== undefined) data.imageUrl = this.imageUrl;
        if (this.id !== undefined) data.id = this.id;

        return data;
    }

    static create(data: IReward): Reward {
        return new Reward(
            data.name,
            data.price,
            data.available,
            data.description,
            data.categoryId,
            data.stock,
            data.imageUrl,
            data.id,
        );
    }
}
