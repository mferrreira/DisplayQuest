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
import { MarkdownEditorDialog } from "@/components/features/markdown-editor-dialog"
import { uploadUserMarkdownImage } from "@/lib/api/user-images"
import {
  FUNDING_AGENCIES,
  FUNDING_AGENCY_LABELS,
  SCHOLARSHIP_TYPES,
  SCHOLARSHIP_TYPE_LABELS,
  USER_LEVELS,
  USER_LEVEL_LABELS,
  maskCpf,
  normalizeUserLinks,
  type UserLink,
} from "@/backend/domain"
import { AlertCircle, CheckCircle, PenLine, Plus, Trash2, User as UserIcon } from "lucide-react"
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
    seBolsista: user.seBolsista ?? null,
    cpf: null,
    links: user.links ?? [],
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bioDialogOpen, setBioDialogOpen] = useState(false)
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
      const bio = formData.bio ? formData.bio : null
      if (bio !== (user.bio ?? null)) updateData.bio = bio
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
      // plan-v22 (R5, DEC-265): a linha "SE BOLSISTA:" do atestado — texto livre da pessoa.
      if (formData.seBolsista !== (user.seBolsista ?? null)) {
        updateData.seBolsista = formData.seBolsista
      }

      const links = normalizeUserLinks(formData.links ?? [])
      if (JSON.stringify(links) !== JSON.stringify(user.links ?? [])) {
        updateData.links = links
      }

      await applyUpdate(updateData)
    } catch (err: any) {
      console.error("Error updating profile:", err)
      setError(err.message || "Erro ao atualizar perfil")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function applyUpdate(updateData: Partial<UserFormData>) {
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
  }

  const handleInputChange = (field: keyof UserFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleNullableSelect = (field: keyof UserFormData, value: string) => {
    handleInputChange(field, value === NO_VALUE ? null : value)
  }

  function addLink() {
    setFormData((prev) => ({ ...prev, links: [...(prev.links ?? []), { label: "", url: "" }] }))
  }

  function updateLink(index: number, field: keyof UserLink, value: string) {
    setFormData((prev) => {
      const links = [...(prev.links ?? [])]
      links[index] = { ...links[index], [field]: value }
      return { ...prev, links }
    })
  }

  function removeLink(index: number) {
    setFormData((prev) => {
      const links = [...(prev.links ?? [])]
      links.splice(index, 1)
      return { ...prev, links }
    })
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
              <Label className="mb-2 block">Biografia</Label>
              <p className="text-xs text-gray-500 dark:text-muted-foreground mb-2">
                {user.bio ? "Tem texto gravado." : "Nada gravado ainda."}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBioDialogOpen(true)}
                disabled={isSubmitting}
              >
                <PenLine className="mr-2 h-4 w-4" />
                Editar biografia
              </Button>
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

            {/* S09 (R14/R15, DEC-264): a pessoa adiciona e remove os próprios links; a lista é
                normalizada pelo servidor, com url sem protocolo virando https. */}
            <div className="space-y-3">
              <Label className="mb-2 block">Links do perfil</Label>
              {(formData.links ?? []).map((link, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`link-label-${index}`}>Label do link {index + 1}</Label>
                  <Input
                    id={`link-label-${index}`}
                    value={link.label}
                    onChange={(e) => updateLink(index, "label", e.target.value)}
                  />
                  <Label htmlFor={`link-url-${index}`}>URL do link {index + 1}</Label>
                  <Input
                    id={`link-url-${index}`}
                    value={link.url}
                    onChange={(e) => updateLink(index, "url", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover link ${link.label}`}
                    onClick={() => removeLink(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addLink}
                disabled={(formData.links ?? []).length >= 10}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar link
              </Button>
            </div>

            {/* plan-v22 (R5, DEC-265): a linha "SE BOLSISTA:" do atestado sai do que a pessoa
                escreveu aqui; para voluntário o campo existe mas não entra no aviso de falta. */}
            <div>
              <Label htmlFor="seBolsista">SE BOLSISTA</Label>
              <Input
                id="seBolsista"
                value={formData.seBolsista ?? ""}
                onChange={(e) => handleInputChange("seBolsista", e.target.value)}
                maxLength={40}
                placeholder="Ex.: BAT-DI-SUP"
              />
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
        {/* S08 (R12/DEC-263): o mesmo editor de markdown da descrição do projeto, com preview.
            Salvar manda só { bio } — a rota decide self OU MANAGE_USERS (R13, gate no servidor). */}
        <MarkdownEditorDialog
          open={bioDialogOpen}
          title="Editar biografia"
          description="Markdown simples; a preview mostra o que a tela do perfil vai renderizar."
          label="Biografia em markdown"
          textareaId="bio-markdown"
          previewTestId="preview-de-bio"
          inputTestId="input-imagem-bio"
          saveLabel="Salvar biografia"
          initialText={formData.bio || ""}
          onOpenChange={setBioDialogOpen}
          upload={(file) => uploadUserMarkdownImage(user.id, file)}
          onSave={async (text) => {
            setFormData((prev) => ({ ...prev, bio: text }))
            await applyUpdate({ bio: text })
          }}
        />
      </CardContent>
    </Card>
  )
}
