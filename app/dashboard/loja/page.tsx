"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useReward } from "@/contexts/reward-context"
import { fetchAPI } from "@/contexts/api-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Coins, CheckCircle, XCircle, Plus, Edit, Trash2, Sparkles, Shield, Trophy } from "lucide-react"
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

type ChestCatalogItem = {
  id: string
  name: string
  description: string
  rarity: string
  priceCoins: number
}

type ChestOpenResult = {
  chestId: string
  chestName: string
  quantity: number
  spentCoins: number
  baseUnitPrice?: number
  discountedUnitPrice?: number
  discountRate?: number
  wallet: {
    userId: number
    coins: number
    updatedAt: string
  }
  drops: Array<{
    itemKey: string
    itemName: string
    rarity: string
    quantity: number
  }>
}

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

  const [chests, setChests] = useState<ChestCatalogItem[]>([])
  const [walletCoins, setWalletCoins] = useState(0)
  const [chestLoading, setChestLoading] = useState(false)
  const [openingChestId, setOpeningChestId] = useState<string | null>(null)
  const [openResult, setOpenResult] = useState<ChestOpenResult | null>(null)
  const [openResultDialogOpen, setOpenResultDialogOpen] = useState(false)
  const [openQuantityByChest, setOpenQuantityByChest] = useState<Record<string, number>>({})

  const canManageStore = hasAccess(user?.roles || [], "MANAGE_REWARDS")

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  const loadGamifiedStore = async () => {
    try {
      setChestLoading(true)
      const [chestRes, walletRes] = await Promise.all([
        fetchAPI<{ chests: ChestCatalogItem[] }>("/api/gamification/store/chests"),
        fetchAPI<{ wallet: { coins: number } }>("/api/gamification/me/wallet"),
      ])
      setChests(Array.isArray(chestRes?.chests) ? chestRes.chests : [])
      setWalletCoins(walletRes?.wallet?.coins ?? 0)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao carregar loja gamificada"
      toast({
        variant: "destructive",
        title: "Falha ao carregar loja",
        description: message,
      })
    } finally {
      setChestLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      void loadGamifiedStore()
    }
  }, [user])

  const currentUserData = users.find((u) => u.id === user?.id)
  const userPoints = currentUserData?.points || 0

  const userPurchases = purchases.filter((p: Purchase) => p.userId === user?.id)
  const availableRewards = rewards.filter((reward) => reward.available)
  const pendingPurchasesCount = purchases.filter((p: Purchase) => p.status === "pending").length

  const formattedPurchases = useMemo(
    () =>
      userPurchases.map((purchase) => ({
        ...purchase,
        formattedDate: new Date(purchase.purchaseDate).toLocaleDateString("pt-BR"),
      })),
    [userPurchases],
  )

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </div>
    )
  }

  const handlePurchase = (reward: Reward) => {
    setSelectedReward(reward)
    setConfirmPurchaseOpen(true)
  }

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
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao realizar compra",
        description: "Ocorreu um erro ao processar sua compra.",
      })
    }

    setConfirmPurchaseOpen(false)
    setSelectedReward(null)
  }

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
      setNewReward({ name: "", description: "", price: 0, available: true })
    }
    setIsManageDialogOpen(true)
  }

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
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar a recompensa.",
      })
    }
  }

  const handleDeleteReward = async (reward: Reward) => {
    try {
      await deleteReward(reward.id)
      toast({
        title: "Recompensa excluída!",
        description: `"${reward.name}" foi removida da loja.`,
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível excluir a recompensa.",
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pendente</Badge>
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

  const rarityClasses = (rarity: string) => {
    const r = rarity.toLowerCase()
    if (r.includes("epic") || r.includes("legend")) return "border-fuchsia-300/50 from-fuchsia-950/35 to-violet-900/25"
    if (r.includes("rare")) return "border-sky-300/50 from-sky-950/35 to-indigo-900/25"
    if (r.includes("uncommon")) return "border-emerald-300/50 from-emerald-950/35 to-teal-900/25"
    return "border-amber-300/50 from-amber-950/35 to-orange-900/25"
  }

  const openChest = async (chestId: string) => {
    const quantity = Math.max(1, openQuantityByChest[chestId] || 1)
    try {
      setOpeningChestId(chestId)
      const response = await fetchAPI<{ result: ChestOpenResult }>(`/api/gamification/store/chests/${chestId}/open`, {
        method: "POST",
        body: JSON.stringify({ quantity }),
      })
      setOpenResult(response.result)
      setOpenResultDialogOpen(true)
      setWalletCoins(response.result.wallet.coins)
      toast({
        title: "Baú aberto!",
        description: `Você abriu ${quantity}x ${response.result.chestName}.`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o baú"
      toast({
        variant: "destructive",
        title: "Falha ao abrir baú",
        description: message,
      })
    } finally {
      setOpeningChestId(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 container mx-auto p-4 md:p-6">
        <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-[#0a0f1e] p-5 md:p-7 text-slate-100 mb-6">
          <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_15%_20%,rgba(251,191,36,0.28),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.24),transparent_32%),linear-gradient(145deg,#0b1224_0%,#0f172a_45%,#0b1020_100%)]" />
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Empório Arcano</p>
              <h1 className="text-3xl md:text-4xl font-black mt-1">Loja do Invocador</h1>
              <p className="text-sm text-slate-300 mt-2">Abra baús, colete relíquias e troque recompensas do laboratório.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 min-w-[280px]">
              <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 py-3">
                <p className="text-xs text-amber-100 uppercase tracking-[0.12em]">Coins RPG</p>
                <p className="text-2xl font-black text-amber-200 mt-1">{walletCoins.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-xl border border-sky-300/35 bg-sky-500/10 px-4 py-3">
                <p className="text-xs text-sky-100 uppercase tracking-[0.12em]">Pontos Lab</p>
                <p className="text-2xl font-black text-sky-200 mt-1">{userPoints.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="chests" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6">
            <TabsTrigger value="chests">Baús RPG</TabsTrigger>
            <TabsTrigger value="rewards">Marketplace</TabsTrigger>
            <TabsTrigger value="purchases">Minhas Compras</TabsTrigger>
            {canManageStore && (
              <TabsTrigger value="approvals" className="relative">
                Aprovações
                {pendingPurchasesCount > 0 && (
                  <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                    {pendingPurchasesCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {canManageStore && <TabsTrigger value="manage">Gerenciar</TabsTrigger>}
          </TabsList>

          <TabsContent value="chests" className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {chestLoading ? (
                  <Card><CardContent className="pt-6">Carregando catálogo de baús...</CardContent></Card>
                ) : chests.length === 0 ? (
                  <Card><CardContent className="pt-6">Nenhum baú disponível.</CardContent></Card>
                ) : (
                  chests.map((chest) => {
                    const quantity = Math.max(1, openQuantityByChest[chest.id] || 1)
                    const totalCost = chest.priceCoins * quantity
                    const canBuy = walletCoins >= totalCost
                    return (
                      <Card key={chest.id} className={`overflow-hidden border bg-gradient-to-br ${rarityClasses(chest.rarity)}`}>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between gap-2 text-slate-100">
                            <span>{chest.name}</span>
                            <Badge variant="outline" className="border-white/40 text-white">{chest.rarity.toUpperCase()}</Badge>
                          </CardTitle>
                          <CardDescription className="text-slate-300">{chest.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2 text-amber-200">
                            <Coins className="h-4 w-4" />
                            <span className="font-bold">{chest.priceCoins} coins</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`qty-${chest.id}`} className="text-slate-200">Qtd</Label>
                            <Input
                              id={`qty-${chest.id}`}
                              type="number"
                              min="1"
                              max="10"
                              value={quantity}
                              onChange={(e) => {
                                const nextValue = Math.max(1, Math.min(10, Number.parseInt(e.target.value || "1", 10) || 1))
                                setOpenQuantityByChest((prev) => ({ ...prev, [chest.id]: nextValue }))
                              }}
                              className="w-24 bg-slate-900/60 border-slate-500 text-slate-100"
                            />
                            <span className="text-xs text-slate-300">Total: {totalCost}</span>
                          </div>
                          <Button
                            onClick={() => void openChest(chest.id)}
                            disabled={!canBuy || openingChestId === chest.id}
                            className="w-full"
                          >
                            {openingChestId === chest.id ? "Abrindo..." : canBuy ? "Abrir Baú" : "Coins insuficientes"}
                          </Button>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>

              <div className="space-y-4">
                <Card className="border-slate-700 bg-slate-950/70 text-slate-100">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-fuchsia-300" />
                      Última Abertura
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!openResult ? (
                      <p className="text-sm text-slate-300">Abra um baú para revelar drops aqui.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-slate-200">
                          <p className="font-semibold">{openResult.chestName}</p>
                          <p>Gasto: {openResult.spentCoins} coins</p>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-auto pr-1">
                          {openResult.drops.map((drop, index) => (
                            <div key={`${drop.itemKey}-${index}`} className="rounded-md border border-slate-600 bg-slate-900/60 p-2 text-sm">
                              <p className="font-medium text-slate-100">{drop.itemName}</p>
                              <p className="text-xs text-slate-300">{drop.rarity.toUpperCase()} • x{drop.quantity}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-700 bg-slate-950/70 text-slate-100">
                  <CardContent className="pt-6">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Dica</p>
                    <p className="mt-2 text-sm text-slate-200">Baús mais raros têm chance melhor de itens épicos e lendários.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

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
                  <Card key={reward.id} className="overflow-hidden border-slate-700 bg-slate-950/70 text-slate-100">
                    <CardHeader className="pb-2">
                      <CardTitle>{reward.name}</CardTitle>
                      <CardDescription className="text-slate-300">{reward.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-1 text-sky-200">
                        <Trophy className="h-4 w-4" />
                        <span className="text-lg font-bold">{reward.price}</span>
                        <span className="text-sm text-slate-300">pontos</span>
                      </div>
                    </CardContent>
                    <div className="px-6 pb-6">
                      <Button
                        onClick={() => handlePurchase(reward)}
                        disabled={userPoints < reward.price}
                        variant={userPoints >= reward.price ? "default" : "outline"}
                        className="w-full"
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
                        <TableCell>{purchase.price}</TableCell>
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
                          <TableCell>{reward.price}</TableCell>
                          <TableCell>
                            <Badge variant={reward.available ? "default" : "secondary"}>
                              {reward.available ? "Disponível" : "Indisponível"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => openManageDialog(reward)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleDeleteReward(reward)}>
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

        <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingReward ? "Editar Recompensa" : "Adicionar Nova Recompensa"}</DialogTitle>
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
                  onChange={(e) => setNewReward({ ...newReward, price: parseInt(e.target.value, 10) || 0 })}
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

        <Dialog open={openResultDialogOpen} onOpenChange={setOpenResultDialogOpen}>
          <DialogContent className="sm:max-w-[560px] border-slate-700 bg-slate-950 text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-fuchsia-300" />
                Recompensas do Baú
              </DialogTitle>
            </DialogHeader>
            {!openResult ? (
              <p className="text-sm text-slate-300">Nenhuma abertura recente.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
                  <p className="font-semibold text-slate-100">{openResult.chestName}</p>
                  <p className="text-slate-300">Quantidade: {openResult.quantity}</p>
                  <p className="text-slate-300">Custo: {openResult.spentCoins} coins</p>
                  {typeof openResult.baseUnitPrice === "number" && typeof openResult.discountedUnitPrice === "number" ? (
                    <p className="text-xs text-emerald-300">
                      Preço por baú: {openResult.baseUnitPrice} → {openResult.discountedUnitPrice}
                      {typeof openResult.discountRate === "number" && openResult.discountRate > 0
                        ? ` (${Math.floor(openResult.discountRate * 100)}% bônus de classe)`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="max-h-80 space-y-2 overflow-auto pr-1">
                  {openResult.drops.map((drop, index) => (
                    <div key={`${drop.itemKey}-${index}`} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-100">{drop.itemName}</p>
                        <Badge variant="outline" className="border-slate-500 text-slate-200">
                          x{drop.quantity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{drop.rarity.toUpperCase()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setOpenResultDialogOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Toaster />
      </main>
    </div>
  )
}
