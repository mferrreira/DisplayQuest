"use client"

/**
 * plan-v24 S01 — o card "Solicitações de troca de senha" na aba de usuários do painel.
 *
 * Acompanha `UserApproval` (o dono pediu a mesma aba). Mesma autoridade do fluxo de
 * moderação de contas: `MANAGE_USERS`, com o estado de negação escrito em tela.
 * Nesta fatia a lista é leitura: ela mostra a solicitação `pending` que a rota pública
 * criou. Os botões Aprovar/Rejeitar entram na S02, sobre os use cases de resolução.
 *
 * A lista nunca traz a hash da senha (CA6): a projeção do use case tira a coluna, e o
 * card não renderiza nada derivado dela.
 */
import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { PasswordResetAPI } from "@/contexts/api-client"
import { useToast } from "@/contexts/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, CheckCircle2, Clock, KeyRound, XCircle } from "lucide-react"
import { hasAccess } from "@/lib/utils/utils"

interface PasswordResetRequest {
  id: number
  email: string
  status: string
  createdAt: string
}

export function PasswordResetRequests() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [requests, setRequests] = useState<PasswordResetRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [processing, setProcessing] = useState<number | null>(null)

  const canManage = hasAccess(user?.roles || [], "MANAGE_USERS")

  useEffect(() => {
    if (canManage) {
      fetchRequests()
    }
  }, [canManage])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setLoadError("")
      const { requests } = await PasswordResetAPI.getRequests()
      setRequests(requests)
    } catch (error) {
      console.error("Erro ao buscar solicitações de troca de senha:", error)
      setLoadError("Não foi possível carregar as solicitações")
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (id: number, action: "approve" | "reject") => {
    try {
      setProcessing(id)
      const result = action === "approve"
        ? await PasswordResetAPI.approve(id)
        : await PasswordResetAPI.reject(id)

      toast({
        title: action === "approve" ? "Solicitação aprovada" : "Solicitação rejeitada",
        // DEC-93: a tela lê a frase da resposta, não recopia a frase da produção.
        description: result.message,
        variant: "default",
      })
      // A linha sai da lista pending só depois da resposta — o card não recalcula nada.
      setRequests((prev) => prev.filter((row) => row.id !== id))
      return result
    } catch (error) {
      console.error(`Erro ao resolver solicitação ${id}:`, error)
      toast({
        title: "Erro",
        description: "Não foi possível resolver a solicitação",
        variant: "destructive",
      })
    } finally {
      setProcessing(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <KeyRound className="h-8 w-8 mx-auto mb-2" />
            <p>Você não tem permissão para ver solicitações de troca de senha</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Solicitações de troca de senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Carregando solicitações...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Solicitações de troca de senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4" role="alert">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Solicitações de troca de senha
        </CardTitle>
        {/* O vazio não repete a frase: a descrição só existe quando há linhas. A frase do
            corpo é a única vez que o vazio aparece (achado da review S01, padrão
            `UserApproval`: descrição e corpo dizem coisas diferentes). */}
        {requests.length > 0 && (
          <CardDescription>
            {requests.length === 1
              ? "1 solicitação pendente"
              : `${requests.length} solicitações pendentes`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center py-8">
            <KeyRound className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma solicitação pendente</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Solicitado em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">{request.email}</TableCell>
                  <TableCell>{formatDate(request.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        aria-label={`Aprovar troca de senha de ${request.email}`}
                        disabled={processing === request.id}
                        onClick={() => handleResolve(request.id, "approve")}
                        className="gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Rejeitar troca de senha de ${request.email}`}
                        disabled={processing === request.id}
                        onClick={() => handleResolve(request.id, "reject")}
                        className="gap-1"
                      >
                        <XCircle className="h-3 w-3" aria-hidden="true" />
                        Rejeitar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
