"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  User, 
  Trophy, 
  Calendar,
  Loader2,
  AlertTriangle
} from "lucide-react"
import { PurchasesAPI } from "@/contexts/api-client"
import { useToast } from "@/contexts/use-toast"
import type { Purchase } from "@/contexts/types"

interface PurchaseApprovalProps {
  purchases: Purchase[]
  onPurchaseUpdate: () => void
}

export function PurchaseApproval({ purchases, onPurchaseUpdate }: PurchaseApprovalProps) {
  const [pendingPurchases, setPendingPurchases] = useState<Purchase[]>([])
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null)
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()

  // Filter pending purchases
  useEffect(() => {
    const pending = purchases.filter(purchase => purchase.status === "pending")
    setPendingPurchases(pending)
  }, [purchases])

  const handleApprove = async (purchase: Purchase) => {
    setSelectedPurchase(purchase)
    setIsApprovalDialogOpen(true)
  }

  const handleDeny = async (purchase: Purchase) => {
    setSelectedPurchase(purchase)
    setIsApprovalDialogOpen(true)
  }

  const confirmAction = async (action: "approve" | "deny") => {
    if (!selectedPurchase) return

    setIsProcessing(true)
    try {
      if (action === "approve") {
        await PurchasesAPI.approve(selectedPurchase.id)
        toast({
          title: "Compra aprovada!",
          description: `A compra de "${selectedPurchase.rewardName}" foi aprovada com sucesso.`,
        })
      } else {
        await PurchasesAPI.deny(selectedPurchase.id)
        toast({
          title: "Compra negada",
          description: `A compra de "${selectedPurchase.rewardName}" foi negada e os pontos foram devolvidos.`,
        })
      }
      
      // Refresh the purchases list
      onPurchaseUpdate()
      setIsApprovalDialogOpen(false)
      setSelectedPurchase(null)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao ${action === "approve" ? "aprovar" : "negar"} a compra.`,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  if (pendingPurchases.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 dark:text-success mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhuma compra pendente para aprovação.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Aprovações Pendentes</h2>
            <p className="text-sm text-muted-foreground">
              {pendingPurchases.length} compra{pendingPurchases.length !== 1 ? 's' : ''} aguardando aprovação
            </p>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {pendingPurchases.length} pendente{pendingPurchases.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Recompensa</TableHead>
                <TableHead>Pontos</TableHead>
                <TableHead>Data da Solicitação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingPurchases.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {purchase.user?.name || `Usuário ${purchase.userId}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{purchase.rewardName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Trophy className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      <span>{purchase.price}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{formatDate(purchase.purchaseDate)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Pendente
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApprove(purchase)}
                        className="text-green-600 hover:text-green-700 dark:text-success dark:hover:text-success/90"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Aprovar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeny(purchase)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Negar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Approval/Denial Confirmation Dialog */}
      <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedPurchase && (
                <>
                  {selectedPurchase.status === "pending" ? "Confirmar Ação" : "Detalhes da Compra"}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedPurchase && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Usuário:</span>
                    <span className="font-medium">
                      {selectedPurchase.user?.name || `Usuário ${selectedPurchase.userId}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Recompensa:</span>
                    <span className="font-medium">{selectedPurchase.rewardName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Pontos:</span>
                    <span className="font-medium flex items-center gap-1">
                      <Trophy className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      {selectedPurchase.price}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Data:</span>
                    <span className="font-medium">{formatDate(selectedPurchase.purchaseDate)}</span>
                  </div>
                </div>
              </div>

              {selectedPurchase.status === "pending" && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Aprovar:</strong> A compra será confirmada e o usuário poderá utilizar a recompensa.<br />
                    <strong>Negar:</strong> A compra será cancelada e os pontos serão devolvidos ao usuário.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsApprovalDialogOpen(false)}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            {selectedPurchase?.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => confirmAction("deny")}
                  disabled={isProcessing}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Negar
                </Button>
                <Button
                  onClick={() => confirmAction("approve")}
                  disabled={isProcessing}
                  className="bg-green-600 hover:bg-green-700 dark:bg-success dark:text-success-foreground dark:hover:bg-success/90"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Aprovar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
} 