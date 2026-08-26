"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useNotifications } from "@/features/notifications"
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Megaphone
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

interface NotificationsPanelProps {
  className?: string
}

export function NotificationsPanel({ className }: NotificationsPanelProps) {
  const { 
    notifications, 
    unreadCount, 
    loading, 
    error, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotifications()
  
  const [isOpen, setIsOpen] = useState(false)

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'TASK_REVIEW_REQUEST':
        return <AlertCircle className="h-4 w-4 text-yellow-500 dark:text-warning" />
      case 'TASK_APPROVED':
        return <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-success" />
      case 'TASK_REJECTED':
        return <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
      case 'TASK_ASSIGNED':
        return <UserPlus className="h-4 w-4 text-blue-500 dark:text-info" />
      case 'PROJECT_INVITATION':
        return <UserPlus className="h-4 w-4 text-purple-500 dark:text-purple-400" />
      case 'SYSTEM_ANNOUNCEMENT':
        return <Megaphone className="h-4 w-4 text-orange-500 dark:text-orange-400" />
      default:
        return <Bell className="h-4 w-4 text-gray-500 dark:text-muted-foreground" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'TASK_REVIEW_REQUEST':
        return 'bg-yellow-50 border-yellow-200 dark:bg-warning/10 dark:border-warning/25'
      case 'TASK_APPROVED':
        return 'bg-green-50 border-green-200 dark:bg-success/10 dark:border-success/25'
      case 'TASK_REJECTED':
        return 'bg-red-50 border-red-200 dark:bg-destructive/10 dark:border-destructive/25'
      case 'TASK_ASSIGNED':
        return 'bg-blue-50 border-blue-200 dark:bg-info/10 dark:border-info/25'
      case 'PROJECT_INVITATION':
        return 'bg-purple-50 border-purple-200 dark:bg-purple-500/10 dark:border-purple-500/25'
      case 'SYSTEM_ANNOUNCEMENT':
        return 'bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/25'
      default:
        return 'bg-gray-50 border-gray-200 dark:bg-muted/40 dark:border-border'
    }
  }

  const handleNotificationClick = async (notification: any) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
  }

  const unreadNotifications = notifications.filter(n => !n.read)
  const readNotifications = notifications.filter(n => n.read)

  return (
    <div className={`relative ${className ?? ""}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
        aria-label={
          unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : "Notificações"
        }
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            aria-hidden="true"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <Card className="absolute right-0 top-12 w-80 z-50 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Notificações</CardTitle>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="h-8 px-2"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <CardDescription>
                {unreadCount} notificação{unreadCount !== 1 ? 'ões' : ''} não lida{unreadCount !== 1 ? 's' : ''}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-96">
              {loading ? (
                <div className="flex items-center justify-center p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-muted-foreground"></div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center p-4 text-red-500 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {error}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex items-center justify-center p-4 text-gray-500 dark:text-muted-foreground">
                  <Bell className="h-8 w-8 mr-2" />
                  Nenhuma notificação
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Notificações não lidas */}
                  {unreadNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-muted/40 border-l-4 border-l-blue-500 ${getNotificationColor(notification.type)}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        {getNotificationIcon(notification.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-foreground">
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-muted-foreground mt-1">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-gray-400 dark:text-muted-foreground/70" />
                            <span className="text-xs text-gray-500 dark:text-muted-foreground">
                              {formatDistanceToNow(new Date(notification.createdAt), { 
                                addSuffix: true, 
                                locale: ptBR 
                              })}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNotification(notification.id)
                          }}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Separador se houver notificações lidas e não lidas */}
                  {unreadNotifications.length > 0 && readNotifications.length > 0 && (
                    <Separator className="my-2" />
                  )}

                  {/* Notificações lidas */}
                  {readNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-muted/40 opacity-75 ${getNotificationColor(notification.type)}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        {getNotificationIcon(notification.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-foreground/90">
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Check className="h-3 w-3 text-green-500 dark:text-success" />
                            <span className="text-xs text-gray-400 dark:text-muted-foreground/70">
                              Lida {formatDistanceToNow(new Date(notification.readAt!), { 
                                addSuffix: true, 
                                locale: ptBR 
                              })}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNotification(notification.id)
                          }}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


