"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Search, User, X } from "lucide-react"
import { User as UserType } from "@/contexts/types"
import { UserProfilesAPI } from "@/contexts/api-client"
import { UserBadges } from "@/components/ui/user-badges"

interface UserSearchProps {
  onUserSelect: (user: UserType) => void
  placeholder?: string
}

export function UserSearch({ onUserSelect, placeholder = "Buscar usuários..." }: UserSearchProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<UserType[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // Debounced search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await UserProfilesAPI.getPublic()
        const users = response.users || []
        
        // Filter users by search term
        const filtered = users.filter(user =>
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
        )
        
        setSearchResults(filtered.slice(0, 5)) // Limit to 5 results
        setShowResults(true)
      } catch (error) {
        console.error("Error searching users:", error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  const handleUserSelect = (user: UserType) => {
    onUserSelect(user)
    setSearchTerm("")
    setShowResults(false)
  }

  const clearSearch = () => {
    setSearchTerm("")
    setSearchResults([])
    setShowResults(false)
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      'COORDENADOR': 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300',
      'GERENTE': 'bg-blue-100 dark:bg-info/15 text-blue-800 dark:text-blue-300',
      'LABORATORISTA': 'bg-green-100 dark:bg-success/15 text-green-800 dark:text-green-300',
      'PESQUISADOR': 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
      'GERENTE_PROJETO': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
      'COLABORADOR': 'bg-gray-100 dark:bg-muted/40 text-gray-800 dark:text-gray-200',
      'VOLUNTARIO': 'bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300',
    }
    return colors[role] || 'bg-gray-100 dark:bg-muted/40 text-gray-800 dark:text-gray-200'
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted-foreground/70" />
        <Input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search Results */}
      {showResults && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-80 overflow-y-auto">
          <CardContent className="p-2">
            
            {isSearching ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-info"></div>
                <span className="ml-2 text-sm text-gray-600 dark:text-muted-foreground">Buscando...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50 dark:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <div>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar || undefined} alt={user.name} />
                      <AvatarFallback className="text-xs">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-foreground truncate">
                        {user.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-muted-foreground truncate">
                        {user.email}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.slice(0, 2).map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className={`text-xs ${getRoleColor(role)}`}
                        >
                          {role.replace('_', ' ')}
                        </Badge>
                      ))}
                      {user.roles.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{user.roles.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>
                  

                  <div className="mt-2">
                    <UserBadges userId={user.id} limit={3} />
                  </div>
                </div>
              ))}
              </div>

            ) : (
              <div className="text-center py-4 text-sm text-gray-500 dark:text-muted-foreground">
                Nenhum usuário encontrado
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

