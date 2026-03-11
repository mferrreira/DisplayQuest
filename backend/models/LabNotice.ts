export interface ILabNotice {
  id?: number
  userId: number
  userName: string
  note: string
  createdAt?: Date
}

export class LabNotice {
  public id?: number
  public userId: number
  public userName: string
  public note: string
  public createdAt?: Date

  constructor(data: ILabNotice) {
    this.id = data.id
    this.userId = data.userId
    this.userName = data.userName
    this.note = data.note
    this.createdAt = data.createdAt
  }

  static create(data: Omit<ILabNotice, "id" | "createdAt">) {
    if (!data.note.trim()) {
      throw new Error("Aviso é obrigatório")
    }

    return new LabNotice({
      ...data,
      note: data.note.trim(),
      createdAt: new Date(),
    })
  }

  static fromPrisma(data: any) {
    return new LabNotice({
      id: data.id,
      userId: data.performedBy,
      userName:
        typeof data.metadata === "object" &&
        data.metadata !== null &&
        "userName" in data.metadata
          ? String(data.metadata.userName)
          : "Usuario",
      note: data.description || "",
      createdAt: data.performedAt ? new Date(data.performedAt) : undefined,
    })
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      userName: this.userName,
      note: this.note,
      createdAt: this.createdAt?.toISOString(),
    }
  }
}
