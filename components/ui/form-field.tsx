"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils/utils"

interface BaseFieldProps {
  label: string
  required?: boolean
  error?: string
  className?: string
}

interface InputFieldProps extends BaseFieldProps {
  type: "text" | "email" | "password" | "number" | "date" | "time"
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  min?: string | number
  max?: string | number
  disabled?: boolean
}

interface TextareaFieldProps extends BaseFieldProps {
  type: "textarea"
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
}

interface SelectFieldProps extends BaseFieldProps {
  type: "select"
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}

type FormFieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps

export function FormField(props: FormFieldProps) {
  const { label, required = false, error, className = "" } = props

  const renderField = () => {
    switch (props.type) {
      case "textarea":
        return (
          <Textarea
            value={props.value}
            onChange={props.onChange}
            placeholder={props.placeholder}
            rows={props.rows || 3}
            disabled={props.disabled}
            className={cn(error && "border-red-500 dark:border-red-400", className)}
          />
        )

      case "select":
        return (
          <Select value={props.value} onValueChange={props.onValueChange} disabled={props.disabled}>
            <SelectTrigger className={cn(error && "border-red-500 dark:border-red-400", className)}>
              <SelectValue placeholder={props.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {props.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      default:
        return (
          <Input
            type={props.type}
            value={props.value}
            onChange={props.onChange}
            placeholder={props.placeholder}
            min={props.min}
            max={props.max}
            disabled={props.disabled}
            className={cn(error && "border-red-500 dark:border-red-400", className)}
          />
        )
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={label.toLowerCase().replace(/\s+/g, '-')}>
        {label}
        {required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
      </Label>
      {renderField()}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
} 