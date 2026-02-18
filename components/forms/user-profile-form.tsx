"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, UserFormData } from "@/contexts/types"
import { UserProfilesAPI } from "@/contexts/api-client"
import { AlertCircle, CheckCircle, User as UserIcon } from "lucide-react"
import { useSession } from "next-auth/react"

interface UserProfileFormProps {
  user: User
  onUpdate: (updatedUser: User) => void
  onCancel: () => void
}

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
    profileVisibility: user.profileVisibility || "public"
  })
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

      const result = await UserProfilesAPI.updateProfile(user.id, updateData)
      const updatedData = result.user
      console.log(updatedData)
      
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
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500 mt-1">
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
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
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
