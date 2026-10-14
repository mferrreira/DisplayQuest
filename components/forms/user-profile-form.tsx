"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, UserFormData } from "@/contexts/types"
import { UserProfilesAPI } from "@/contexts/api-client"
import {
  FUNDING_AGENCIES,
  FUNDING_AGENCY_LABELS,
  SCHOLARSHIP_TYPES,
  SCHOLARSHIP_TYPE_LABELS,
  USER_LEVELS,
  USER_LEVEL_LABELS,
  maskCpf,
} from "@/backend/domain"
import { AlertCircle, CheckCircle, User as UserIcon } from "lucide-react"
import { useSession } from "next-auth/react"

interface UserProfileFormProps {
  user: User
  onUpdate: (updatedUser: User) => void
  onCancel: () => void
}

/** Sentinela do Select: "sem valor" não pode ser string vazia no Radix. */
const NO_VALUE = "none"

export function UserProfileForm({ user, onUpdate, onCancel }: UserProfileFormProps) {
  const { update: updateSession } = useSession()
  const [formData, setFormData] = useState<UserFormData>({
    name: user.name || "",
    email: user.email || "",
    roles: user.roles || [],
    password: "",
    weekHours: user.weekHours || 0,
    bio: user.bio || "",
    avatar: user.avatar || "",
    profileVisibility: user.profileVisibility || "public",
    // V5-4a (DEC-138): os campos abertos vêm da sessão. O CPF não vem, e é buscado abaixo.
    registrationNumber: user.registrationNumber ?? null,
    course: user.course ?? null,
    scholarshipType: user.scholarshipType ?? null,
    fundingAgency: user.fundingAgency ?? null,
    fundingAgencyOther: user.fundingAgencyOther ?? null,
    level: user.level ?? null,
    cpf: null,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // O CPF é o único dado de pessoa com leitura restrita (DEC-138), e a sessão não o carrega:
  // ele chega pela rota de perfil, que decide o direito a cada chamada.
  //
  // `cpfKnown` é o valor que o formulário sabe estar gravado. Sem ele, o CPF lido na rota seria
  // comparado com a sessão (onde ele não existe) e todo salvamento re-enviaria o campo — a trava
  // de "só o que mudou" viraria teatro.
  const [cpfKnown, setCpfKnown] = useState<string | null>(maskCpf(user.cpf ?? null))

  useEffect(() => {
    let cancelled = false
    UserProfilesAPI.getProfile(user.id)
      .then((payload) => {
        const masked = maskCpf(typeof payload?.user?.cpf === "string" ? payload.user.cpf : null)
        if (cancelled || masked === null) return
        setCpfKnown(masked)
        setFormData((prev) => ({ ...prev, cpf: masked }))
      })
      .catch(() => {
        // Sem leitura disponível o campo fica em branco: preencher de novo é o caminho, e
        // inventar um CPF a partir de nada não é.
      })
    return () => {
      cancelled = true
    }
  }, [user.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const updateData: Partial<UserFormData> = {}

      if (formData.name !== user.name) updateData.name = formData.name
      if (formData.bio !== user.bio) updateData.bio = formData.bio
      if (formData.profileVisibility !== user.profileVisibility) updateData.profileVisibility = formData.profileVisibility
      if (formData.weekHours !== user.weekHours) updateData.weekHours = formData.weekHours

      if (formData.password)
        updateData.password = formData.password

      // Só o que mudou. "none" no Select é "sem dado", e vai como null.
      if (formData.cpf !== cpfKnown) updateData.cpf = formData.cpf || null
      if (formData.registrationNumber !== (user.registrationNumber ?? null)) {
        updateData.registrationNumber = formData.registrationNumber
      }
      if (formData.course !== (user.course ?? null)) updateData.course = formData.course
      if (formData.scholarshipType !== (user.scholarshipType ?? null)) {
        updateData.scholarshipType = formData.scholarshipType
      }
      if (formData.fundingAgency !== (user.fundingAgency ?? null)) {
        updateData.fundingAgency = formData.fundingAgency
      }
      if (formData.fundingAgencyOther !== (user.fundingAgencyOther ?? null)) {
        updateData.fundingAgencyOther = formData.fundingAgencyOther
      }
      if (formData.level !== (user.level ?? null)) updateData.level = formData.level

      const result = await UserProfilesAPI.updateProfile(user.id, updateData)
      const updatedData = result.user

      onUpdate(updatedData)
      await updateSession({
        user: {
          ...updatedData,
        },
      })

      setSuccess("Perfil atualizado com sucesso!")

      // Clear password field
      setFormData(prev => ({ ...prev, password: "" }))
    } catch (err: any) {
      console.error("Error updating profile:", err)
      setError(err.message || "Erro ao atualizar perfil")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: keyof UserFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleNullableSelect = (field: keyof UserFormData, value: string) => {
    handleInputChange(field, value === NO_VALUE ? null : value)
  }

  const fundingAgencyIsOther = formData.fundingAgency === "OUTRA"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <UserIcon className="h-5 w-5" />
          <span>Editar Perfil</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => handleInputChange("name", e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                disabled
                className="bg-gray-50 dark:bg-muted/40"
              />
              <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">
                O email não pode ser alterado
              </p>
            </div>

            <div>
              <Label htmlFor="bio">Biografia</Label>
              <Textarea
                id="bio"
                value={formData.bio || ""}
                onChange={(e) => handleInputChange("bio", e.target.value)}
                placeholder="Conte um pouco sobre você..."
                rows={3}
              />
            </div>


            <div>
              <Label htmlFor="profileVisibility">Visibilidade do Perfil</Label>
              <Select 
                value={formData.profileVisibility || "public"} 
                onValueChange={(value: "public" | "private" | "members_only") => 
                  handleInputChange("profileVisibility", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Público</SelectItem>
                  <SelectItem value="members_only">Apenas Membros</SelectItem>
                  <SelectItem value="private">Privado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="weekHours">Horas Semanais</Label>
              <Input
                id="weekHours"
                type="number"
                step="0.5"
                min="0"
                value={formData.weekHours || 0}
                onChange={(e) => handleInputChange("weekHours", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* V5-4a (DEC-138): os dados que os formulários oficiais pedem — atestado e relatório
              técnico. A pessoa escreve os próprios; quem gerencia também edita, pelo painel. */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium">Dados para os documentos oficiais</h3>

            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={formData.cpf ?? ""}
                onChange={(e) => handleInputChange("cpf", e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
              <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">
                Só você e quem gerencia contas leem o CPF.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="registrationNumber">Matrícula</Label>
                <Input
                  id="registrationNumber"
                  value={formData.registrationNumber ?? ""}
                  onChange={(e) => handleInputChange("registrationNumber", e.target.value)}
                  placeholder="Ex.: 2026110001"
                />
              </div>
              <div>
                <Label htmlFor="course">Curso</Label>
                <Input
                  id="course"
                  value={formData.course ?? ""}
                  onChange={(e) => handleInputChange("course", e.target.value)}
                  placeholder="Ex.: Sistemas de Informação"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="scholarshipType">Modalidade de IC</Label>
                <Select
                  value={formData.scholarshipType ?? NO_VALUE}
                  onValueChange={(value) => handleNullableSelect("scholarshipType", value)}
                >
                  <SelectTrigger id="scholarshipType" aria-label="Modalidade de IC">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VALUE}>Sem modalidade</SelectItem>
                    {SCHOLARSHIP_TYPES.map((token) => (
                      <SelectItem key={token} value={token}>
                        {SCHOLARSHIP_TYPE_LABELS[token]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="level">Nível</Label>
                <Select
                  value={formData.level ?? NO_VALUE}
                  onValueChange={(value) => handleNullableSelect("level", value)}
                >
                  <SelectTrigger id="level" aria-label="Nível">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VALUE}>Sem nível</SelectItem>
                    {USER_LEVELS.map((token) => (
                      <SelectItem key={token} value={token}>
                        {USER_LEVEL_LABELS[token]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="fundingAgency">Instituição de fomento</Label>
                <Select
                  value={formData.fundingAgency ?? NO_VALUE}
                  onValueChange={(value) => handleNullableSelect("fundingAgency", value)}
                >
                  <SelectTrigger id="fundingAgency" aria-label="Instituição de fomento">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VALUE}>Sem fomento</SelectItem>
                    {FUNDING_AGENCIES.map((token) => (
                      <SelectItem key={token} value={token}>
                        {FUNDING_AGENCY_LABELS[token]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {fundingAgencyIsOther && (
                <div>
                  <Label htmlFor="fundingAgencyOther">Nome da instituição</Label>
                  <Input
                    id="fundingAgencyOther"
                    value={formData.fundingAgencyOther ?? ""}
                    onChange={(e) => handleInputChange("fundingAgencyOther", e.target.value)}
                    placeholder="Ex.: FAPEMIG"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Password Section */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium">Alterar Senha</h3>
            <div>
              <Label htmlFor="password">Nova Senha</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                placeholder="Deixe em branco para manter a senha atual"
              />
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 dark:border-success/25 bg-green-50 dark:bg-success/10">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-success" />
              <AlertDescription className="text-green-800 dark:text-green-300">{success}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
