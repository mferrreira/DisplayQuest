"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useReward } from "@/contexts/reward-context"
import { useUser } from "@/contexts/user-context"
import type { rewards as Reward, purchases as Purchase } from "@prisma/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Trash2, CheckCircle, XCircle } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { hasAccess } from "@/lib/utils/utils"

export default function ManageRewardsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { rewards, purchases } = useReward()
  const { users } = useUser()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingReward, setEditingReward] = useState<Reward | null>(null)
  const [rewardToDelete, setRewardToDelete] = useState<string | null>(null)

  const [formData, setFormData] = useState<Omit<Reward, "id">>({
    name: "",
    description: "",
    price: 50,
    available: true,
  })

  const checkAuthentication = () => {
    if (!loading && !user) {
      router.push("/login")
      return false
    }
    if (!loading && user && !hasAccess(user.roles || [], 'MANAGE_REWARDS')) {
      router.push("/dashboard")
      return false
    }
    return true
  }

  useEffect(() => {
    checkAuthentication()
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </div>
    )
  }

  if (!hasAccess(user?.roles || [], 'MANAGE_REWARDS')) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 container mx-auto p-4 md:p-6">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Acesso Negado</AlertTitle>
            <AlertDescription>
              Você não tem permissão para acessar esta página. Apenas gerentes podem gerenciar recompensas.
            </AlertDescription>
          </Alert>
        </main>
      </div>
    )
  }

  useEffect(() => {
    if (isDialogOpen && editingReward) {
      setFormData({
        name: editingReward.name,
        description: editingReward.description,
        price: editingReward.price,
        available: editingReward.available,
      })
    } else if (isDialogOpen) {
      setFormData({
        name: "",
        description: "",
        price: 50,
        available: true,
      })
    }
  }, [isDialogOpen, editingReward])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === "price" ? Number.parseInt(value) || 0 : value,
    }))
  }

  const handleSwitchChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, available: checked }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsDialogOpen(false)
    setEditingReward(null)
  }

  const handleEdit = (reward: Reward) => {
    setEditingReward(reward)
    setIsDialogOpen(true)
  }

  const handleDelete = (rewardId: string) => {
    setRewardToDelete(rewardId)
  }

  const confirmDelete = () => {
    if (rewardToDelete) {
      setRewardToDelete(null)
    }
  }

  const getUserName = (userId: number) => {
    const user = users.find((u) => u.id === userId)
    return user?.name || "Usuário desconhecido"
  }

  // Memoize formatted purchase dates
  const formattedPurchases = useMemo(
    () =>
      purchases.map((purchase) => ({
        ...purchase,
        formattedDate: new Date(purchase.purchaseDate).toLocaleDateString("pt-BR"),
      })),
    [purchases],
  ) as Array<Purchase>

  const pendingPurchases = purchases.filter((p) => p.status === "pending")

  return (
    <div className="flex min-h-screen flex-col">

      <main className="flex-1 container mx-auto p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-6">Gerenciar Recompensas</h1>

        <Tabs defaultValue="rewards">
          <TabsList className="mb-4">
            <TabsTrigger value="rewards">Recompensas</TabsTrigger>
            <TabsTrigger value="pending">
              Solicitações Pendentes
              {pendingPurchases.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingPurchases.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="rewards">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Recompensa
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Pontos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rewards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        Nenhuma recompensa encontrada. Crie uma nova recompensa para começar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rewards.map((reward) => (
                      <TableRow key={reward.id}>
                        <TableCell className="font-medium">{reward.name}</TableCell>
                        <TableCell>{reward.description}</TableCell>
                        <TableCell>{reward.price}</TableCell>
                        <TableCell>
                          {reward.available ? (
                            <Badge variant="default">
                              Disponível
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Indisponível</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(reward)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(reward.id.toString())}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="pending">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Recompensa</TableHead>
                    <TableHead>Pontos</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="w-[150px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPurchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        Não há solicitações pendentes no momento.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>{getUserName(purchase.userId)}</TableCell>
                        <TableCell className="font-medium">{purchase.rewardName}</TableCell>
                        <TableCell>{purchase.price}</TableCell>
                        <TableCell>{purchase.formattedDate}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Aprovar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1"
                            >
                              <XCircle className="h-4 w-4" />
                              Rejeitar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Recompensa</TableHead>
                    <TableHead>Pontos</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.filter((p) => p.status !== "pending").length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        Não há histórico de compras.
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchases
                      .filter((p) => p.status !== "pending")
                      .map((purchase) => (
                        <TableRow key={purchase.id}>
                          <TableCell>{getUserName(purchase.userId)}</TableCell>
                          <TableCell className="font-medium">{purchase.rewardName}</TableCell>
                          <TableCell>{purchase.price}</TableCell>
                          <TableCell>{purchase.formattedDate}</TableCell>
                          <TableCell>
                            {purchase.status === "approved" && (
                              <Badge variant="default">
                                Aprovado
                              </Badge>
                            )}
                            {purchase.status === "rejected" && <Badge variant="destructive">Rejeitado</Badge>}
                            {purchase.status === "used" && <Badge variant="secondary">Utilizado</Badge>}
                          </TableCell>
                          <TableCell>
                            {purchase.status === "approved" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Marcar como Utilizado
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingReward ? "Editar Recompensa" : "Nova Recompensa"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome da Recompensa</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name ?? ""}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description ?? ""}
                    onChange={handleChange}
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">Pontos Necessários</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    min="1"
                    value={formData.price ?? 0}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="available">Disponível para Resgate</Label>
                  <Switch id="available" checked={formData.available} onCheckedChange={handleSwitchChange} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">{editingReward ? "Salvar Alterações" : "Criar Recompensa"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!rewardToDelete} onOpenChange={() => setRewardToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso excluirá permanentemente a recompensa.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
