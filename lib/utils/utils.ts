import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { isRole } from "@/lib/auth/rbac"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

export function calculateTimeDifference(startTime: string, endTime: string): number {
  return parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime)
}

export function validateRequiredFields(data: any, fields: string[]): { valid: boolean; error?: string } {
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return { valid: false, error: `Campo '${field}' é obrigatório` }
    }
  }
  return { valid: true }
}

export function validateTimeOrder(startTime: string, endTime: string): { valid: boolean; error?: string } {
  if (parseTimeToMinutes(startTime) >= parseTimeToMinutes(endTime)) {
    return { valid: false, error: "Horário inicial deve ser antes do horário final" }
  }
  return { valid: true }
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Email inválido" }
  }
  return { valid: true }
}

// Refatorar validateRole para aceitar array de roles e validar todos os papéis.
export function validateRole(role: string): { valid: boolean; error?: string } {
  if (!isRole(role)) {
    return { valid: false, error: "Função inválida" }
  }
  return { valid: true }
}

// Nova função para validar múltiplos papéis
export function validateRoles(roles: string[]): { valid: boolean; error?: string } {
  for (const role of roles) {
    if (!isRole(role)) {
      return { valid: false, error: `Papel inválido: ${role}` };
    }
  }
  return { valid: true };
}

export function handlePrismaError(error: any): { status: number; message: string } {
  if (error.code === 'P2025') {
    return { status: 404, message: "Registro não encontrado" }
  }
  if (error.code === 'P2002') {
    return { status: 400, message: "Registro já existe" }
  }
  if (error.code === 'P2003') {
    return { status: 400, message: "Referência inválida" }
  }
  console.error("Database error:", error)
  return { status: 500, message: "Erro interno do servidor" }
}

export function createApiResponse<T>(data: T, status: number = 200) {
  return Response.json({ data }, { status })
}

export function createApiError(message: string, status: number = 500) {
  return Response.json({ error: message }, { status })
}

export function sanitizeUser(user: any) {
  const { password, ...safeUser } = user
  return safeUser
}

export function paginateResults<T>(items: T[], page: number = 1, limit: number = 10) {
  const startIndex = (page - 1) * limit
  const endIndex = startIndex + limit
  const paginatedItems = items.slice(startIndex, endIndex)
  
  return {
    data: paginatedItems,
    pagination: {
      page,
      limit,
      total: items.length,
      totalPages: Math.ceil(items.length / limit),
      hasNext: endIndex < items.length,
      hasPrev: page > 1
    }
  }
}

export { 
  ACCESS_CONTROL, 
  hasAccess, 
  hasAnyRole, 
  hasAllRoles, 
  getPrimaryRole, 
  getRoleDisplayName 
} from "./access-control";
