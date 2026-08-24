"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Upload, 
  Camera, 
  X, 
  User as UserIcon,
  AlertCircle,
  CheckCircle
} from "lucide-react"
import { User } from "@/contexts/types"
import { useSession } from "next-auth/react"

interface ProfilePictureUploadProps {
  user: User
  onUpdate: (updatedUser: User) => void
  onError?: (error: string) => void
}

export function ProfilePictureUpload({ user, onUpdate, onError }: ProfilePictureUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { update: updateSession } = useSession()

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione apenas arquivos de imagem')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('O arquivo deve ter no máximo 5MB')
      return
    }

    setError(null)
    setSuccess(null)

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      // Create FormData
      const formData = new FormData()
      formData.append('avatar', file)
      formData.append('userId', user.id.toString())

      // Upload to server
      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        credentials: 'include', // Include cookies for authentication
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao fazer upload da imagem')
      }

      const result = await response.json()
      
      // Update user with new avatar URL
      const updatedUser = {
        ...user,
        avatar: result.avatarUrl
      }
      
      // Update the session to reflect the new avatar
      await updateSession()
      
      onUpdate(updatedUser)
      setSuccess('Foto de perfil atualizada com sucesso!')
      setPreview(null)
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err: any) {
      console.error('Error uploading avatar:', err)
      setError(err.message || 'Erro ao fazer upload da imagem')
      if (onError) {
        onError(err.message || 'Erro ao fazer upload da imagem')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/users/${user.id}/avatar`, {
        method: 'DELETE',
        credentials: 'include', // Include cookies for authentication
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao remover foto de perfil')
      }

      // Update user without avatar
      const updatedUser = {
        ...user,
        avatar: null
      }
      
      // Update the session to reflect the removed avatar
      await updateSession()
      
      onUpdate(updatedUser)
      setSuccess('Foto de perfil removida com sucesso!')
    } catch (err: any) {
      console.error('Error removing avatar:', err)
      setError(err.message || 'Erro ao remover foto de perfil')
      if (onError) {
        onError(err.message || 'Erro ao remover foto de perfil')
      }
    } finally {
      setUploading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Camera className="h-5 w-5" />
          <span>Foto de Perfil</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Avatar */}
        <div className="flex items-center space-x-4">
          <Avatar className="h-20 w-20">
            <AvatarImage 
              src={preview || user.avatar || undefined} 
              alt={user.name} 
            />
            <AvatarFallback className="text-lg font-semibold">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-foreground">{user.name}</h3>
            <p className="text-sm text-gray-600 dark:text-muted-foreground">
              {user.avatar ? 'Foto de perfil ativa' : 'Nenhuma foto de perfil'}
            </p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="avatar-upload">Selecionar Nova Foto</Label>
            <Input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              ref={fileInputRef}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">
              Formatos aceitos: JPG, PNG, GIF. Tamanho máximo: 5MB. 
              <br />
              As imagens serão convertidas para WebP e redimensionadas para 300x300px.
            </p>
          </div>

          {/* Preview and Actions */}
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={preview} alt="Preview" />
                  <AvatarFallback>
                    <UserIcon className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-foreground">Pré-visualização</p>
                  <p className="text-xs text-gray-600 dark:text-muted-foreground">Esta será sua nova foto de perfil</p>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  size="sm"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 /* dark-mode:ok (sobre overlay escuro) */"></div>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Confirmar Upload
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(null)
                    if (fileInputRef.current) {
                      fileInputRef.current.value = ''
                    }
                  }}
                  size="sm"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Remove Avatar Button */}
          {user.avatar && !preview && (
            <Button
              variant="outline"
              onClick={handleRemoveAvatar}
              disabled={uploading}
              size="sm"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 dark:border-border mr-2"></div>
                  Removendo...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Remover Foto Atual
                </>
              )}
            </Button>
          )}
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
      </CardContent>
    </Card>
  )
}

