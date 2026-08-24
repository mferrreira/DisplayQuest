"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Filter, SortAsc, SortDesc, Edit, Trash2, Eye } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Column<T> {
  key: keyof T
  header: string
  render?: (value: any, item: T) => React.ReactNode
  sortable?: boolean
  filterable?: boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onEdit?: (item: T) => void
  onDelete?: (item: T) => void
  onView?: (item: T) => void
  showSearch?: boolean
  showFilters?: boolean
  showActions?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
}

export function DataTable<T extends { id?: number | string }>({
  data,
  columns,
  onEdit,
  onDelete,
  onView,
  showSearch = true,
  showFilters = true,
  showActions = true,
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum dado encontrado",
  className = ""
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [filters, setFilters] = useState<Record<string, string>>({})

  const filteredAndSortedData = data
    .filter((item) => {
      // Search filter
      if (searchTerm) {
        const searchableText = columns
          .map(col => {
            const value = item[col.key]
            return typeof value === "string" ? value : String(value)
          })
          .join(" ")
          .toLowerCase()
        
        if (!searchableText.includes(searchTerm.toLowerCase())) {
          return false
        }
      }

      // Column filters
      for (const [key, value] of Object.entries(filters)) {
        if (value && item[key as keyof T] !== value) {
          return false
        }
      }

      return true
    })
    .sort((a, b) => {
      if (!sortColumn) return 0

      const aValue = a[sortColumn]
      const bValue = b[sortColumn]

      if (aValue === bValue) return 0

      const comparison = aValue < bValue ? -1 : 1
      return sortDirection === "asc" ? comparison : -comparison
    })

  const handleSort = (column: keyof T) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const handleFilter = (column: keyof T, value: string) => {
    setFilters(prev => ({
      ...prev,
      [column as string]: value
    }))
  }

  const renderCell = (item: T, column: Column<T>) => {
    const value = item[column.key]

    if (column.render) {
      return column.render(value, item)
    }

    if (typeof value === "boolean") {
      return (
        <Badge variant={value ? "default" : "secondary"}>
          {value ? "Sim" : "Não"}
        </Badge>
      )
    }

    if (typeof value === "string" && value.length > 50) {
      return (
        <span title={value}>
          {value.substring(0, 50)}...
        </span>
      )
    }

    return String(value || "")
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search and Filters */}
      {(showSearch || showFilters) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {showSearch && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted-foreground/70" />
              <Input
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {showFilters && (
            <div className="flex gap-2">
              {columns
                .filter(col => col.filterable)
                .map(col => (
                  <Input
                    key={String(col.key)}
                    placeholder={`Filtrar ${col.header}`}
                    value={filters[String(col.key)] || ""}
                    onChange={(e) => handleFilter(col.key, e.target.value)}
                    className="w-32"
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={String(column.key)}>
                  <div className="flex items-center space-x-2">
                    <span>{column.header}</span>
                    {column.sortable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort(column.key)}
                        className="h-6 w-6 p-0"
                      >
                        {sortColumn === column.key ? (
                          sortDirection === "asc" ? (
                            <SortAsc className="h-3 w-3" />
                          ) : (
                            <SortDesc className="h-3 w-3" />
                          )
                        ) : (
                          <Filter className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableHead>
              ))}
              {showActions && (onEdit || onDelete || onView) && (
                <TableHead className="w-20">Ações</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedData.length > 0 ? (
              filteredAndSortedData.map((item, index) => (
                <TableRow key={item.id || index}>
                  {columns.map((column) => (
                    <TableCell key={String(column.key)}>
                      {renderCell(item, column)}
                    </TableCell>
                  ))}
                  {showActions && (onEdit || onDelete || onView) && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menu</span>
                            <Filter className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onView && (
                            <DropdownMenuItem onClick={() => onView(item)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Visualizar
                            </DropdownMenuItem>
                          )}
                          {onEdit && (
                            <DropdownMenuItem onClick={() => onEdit(item)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <DropdownMenuItem 
                              onClick={() => onDelete(item)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length + (showActions ? 1 : 0)} className="text-center py-8">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results Count */}
      {filteredAndSortedData.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-muted-foreground text-center">
          {filteredAndSortedData.length} de {data.length} registro(s)
        </div>
      )}
    </div>
  )
} 