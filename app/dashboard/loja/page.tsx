"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useReward } from "@/contexts/reward-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { CheckCircle, XCircle, Plus, Edit, Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { toast } from "@/components/ui/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Toaster } from "@/components/ui/toaster"
import { PurchaseApproval } from "@/components/ui/purchase-approval"
import type { Reward, Purchase } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/utils"

export default function StorePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { users } = useUser()
  const { rewards, purchases, purchaseReward, createReward, updateReward, deleteReward, fetchPurchases } = useReward()

  const [selectedReward, setSelectedReward] = useState<Reward | null>(null)
  const [confirmPurchaseOpen, setConfirmPurchaseOpen] = useState(false)
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false)
  const [editingReward, setEditingReward] = useState<Reward | null>(null)
  const [newReward, setNewReward] = useState({
    name: "",
    description: "",
    price: 0,
    available: true,
  })

  const canManageStore = hasAccess(user?.roles || [], 'MANAGE_REWARDS')

  useEffect(() => {
    // Redirecionar para login se não estiver autenticado
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  // Encontrar usuário atual para obter pontos
  const currentUserData = users.find((u) => u.id === user?.id)
  const userPoints = currentUserData?.points || 0

  // Obter compras do usuário
  const userPurchases = purchases.filter((p: Purchase) => p.userId === user?.id)

  // Filtrar recompensas disponíveis
  const availableRewards = rewards.filter((reward) => reward.available)

  // Contar compras pendentes para aprovação
  const pendingPurchasesCount = purchases.filter((p: Purchase) => p.status === "pending").length

  // Memoize formatted purchase dates
  const formattedPurchases = useMemo(() =>
    userPurchases.map((purchase) => ({
      ...purchase,
      formattedDate: new Date(purchase.purchaseDate).toLocaleDateString("pt-BR"),
    }))
  , [userPurchases])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </div>
    )
  }

  // Função para comprar recompensa
  const handlePurchase = (reward: Reward) => {
    setSelectedReward(reward)
    setConfirmPurchaseOpen(true)
  }

  // Confirmar compra
  const confirmPurchase = async () => {
    if (!selectedReward || !user) return

    try {
      const purchase = await purchaseReward(user.id, selectedReward.id)
      
      if (purchase) {
        toast({
          title: "Compra realizada com sucesso!",
          description: `Você adquiriu "${selectedReward.name}" por ${selectedReward.price} pontos.`,
          action: <ToastAction altText="Ver minhas compras">Ver compras</ToastAction>,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao realizar compra",
          description: "Você não tem pontos suficientes para esta recompensa.",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao realizar compra",
        description: "Ocorreu um erro ao processar sua compra.",
      })
    }

    setConfirmPurchaseOpen(false)
    setSelectedReward(null)
  }

  // Abrir diálogo para adicionar/editar recompensa
  const openManageDialog = (reward?: Reward) => {
    if (reward) {
      setEditingReward(reward)
      setNewReward({
        name: reward.name,
        description: reward.description || "",
        price: reward.price,
        available: reward.available,
      })
    } else {
      setEditingReward(null)
      setNewReward({
        name: "",
        description: "",
        price: 0,
        available: true,
      })
    }
    setIsManageDialogOpen(true)
  }

  // Salvar recompensa
  const handleSaveReward = async () => {
    try {
      if (editingReward) {
        await updateReward(editingReward.id, newReward)
        toast({
          title: "Recompensa atualizada!",
          description: `"${newReward.name}" foi atualizada com sucesso.`,
        })
      } else {
        await createReward(newReward)
        toast({
          title: "Recompensa criada!",
          description: `"${newReward.name}" foi adicionada à loja.`,
        })
      }
      setIsManageDialogOpen(false)
      setEditingReward(null)
      setNewReward({ name: "", description: "", price: 0, available: true })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar a recompensa.",
      })
    }
  }

  // Excluir recompensa
  const handleDeleteReward = async (reward: Reward) => {
    try {
      await deleteReward(reward.id)
      toast({
        title: "Recompensa excluída!",
        description: `"${reward.name}" foi removida da loja.`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível excluir a recompensa.",
      })
    }
  }

  // Obter badge de status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Pendente</span>
          </Badge>
        )
      case "approved":
        return (
          <Badge variant="default" className="bg-green-500 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Aprovado
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" /> Rejeitado
          </Badge>
        )
      case "used":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Utilizado
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 container mx-auto p-4 md:p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Loja de Recompensas</h1>
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded-md">
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{userPoints}</span>
            <span className="text-sm text-muted-foreground">pontos disponíveis</span>
          </div>
        </div>

        <Tabs defaultValue="rewards">
          <TabsList className="mb-4">
            <TabsTrigger value="rewards" className="flex items-center gap-1">
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400">Recompensas</span>
            </TabsTrigger>
            <TabsTrigger value="purchases" className="flex items-center gap-1">
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400">Minhas Compras</span>
            </TabsTrigger>
            {canManageStore && (
              <>
                <TabsTrigger value="approvals" className="flex items-center gap-1 relative">
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400">Aprovações</span>
                  {pendingPurchasesCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                      {pendingPurchasesCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="manage" className="flex items-center gap-1">
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400">Gerenciar</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="rewards">
            {availableRewards.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">Nenhuma recompensa disponível no momento.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableRewards.map((reward) => (
                  <Card key={reward.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle>{reward.name}</CardTitle>
                      <CardDescription>{reward.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <span className="text-lg font-bold">{reward.price}</span>
                        <span className="text-sm text-muted-foreground">pontos</span>
                      </div>
                    </CardContent>
                    <div className="flex justify-between">
                      <Button
                        onClick={() => handlePurchase(reward)}
                        disabled={userPoints < reward.price}
                        variant={userPoints >= reward.price ? "default" : "outline"}
                      >
                        {userPoints >= reward.price ? "Resgatar" : "Pontos insuficientes"}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="purchases">
            {userPurchases.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">Você ainda não resgatou nenhuma recompensa.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recompensa</TableHead>
                      <TableHead>Pontos</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formattedPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell className="font-medium">{purchase.rewardName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span>{purchase.price}</span>
                          </div>
                        </TableCell>
                        <TableCell>{purchase.formattedDate}</TableCell>
                        <TableCell>{getStatusBadge(purchase.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {canManageStore && (
            <TabsContent value="approvals">
              <PurchaseApproval 
                purchases={purchases} 
                onPurchaseUpdate={() => {
                  // Refresh purchases data
                  fetchPurchases()
                }} 
              />
            </TabsContent>
          )}

          {canManageStore && (
            <TabsContent value="manage">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold">Gerenciar Produtos da Loja</h2>
                  <Button onClick={() => openManageDialog()} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar Produto
                  </Button>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Preço (Pontos)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rewards.map((reward) => (
                        <TableRow key={reward.id}>
                          <TableCell className="font-medium">{reward.name}</TableCell>
                          <TableCell className="max-w-xs truncate">{reward.description}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span>{reward.price}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={reward.available ? "default" : "secondary"}>
                              {reward.available ? "Disponível" : "Indisponível"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openManageDialog(reward)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteReward(reward)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Dialog para adicionar/editar recompensa */}
        <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingReward ? "Editar Recompensa" : "Adicionar Nova Recompensa"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nome da Recompensa *</Label>
                <Input
                  id="name"
                  value={newReward.name}
                  onChange={(e) => setNewReward({ ...newReward, name: e.target.value })}
                  placeholder="Ex: Café grátis, Dia de folga, etc."
                />
              </div>
              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={newReward.description}
                  onChange={(e) => setNewReward({ ...newReward, description: e.target.value })}
                  placeholder="Descreva a recompensa..."
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="price">Preço em Pontos *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  value={newReward.price}
                  onChange={(e) => setNewReward({ ...newReward, price: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="available"
                  checked={newReward.available}
                  onCheckedChange={(checked) => setNewReward({ ...newReward, available: checked })}
                />
                <Label htmlFor="available">Disponível para compra</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsManageDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveReward} disabled={!newReward.name || newReward.price <= 0}>
                {editingReward ? "Atualizar" : "Adicionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmPurchaseOpen} onOpenChange={setConfirmPurchaseOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Resgate</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a resgatar "{selectedReward?.name}" por {selectedReward?.price} pontos. Seus pontos
                serão deduzidos imediatamente e a solicitação será enviada para aprovação.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPurchase}>Confirmar Resgate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Toaster />
      </main>
    </div>
  )
}
