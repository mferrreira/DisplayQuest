/**
 * Date-only (calendar date) utilities for YYYY-MM-DD strings.
 * 
 * Avoids `new Date("YYYY-MM-DD")` entirely — that parses as UTC midnight,
 * causing off-by-one-day display in negative UTC offsets (e.g. UTC-3 Brazil).
 * 
 * Why string manipulation instead of Date objects:
 * - YYYY-MM-DD strings are lexicographically sortable (ISO 8601 design goal)
 * - No timezone conversion bugs
 * - No DST edge cases
 * - Fast and simple
 */

/**
 * Format a date-only string (YYYY-MM-DD) as DD/MM/YYYY for display.
 * Returns empty string if input is null/undefined.
 * 
 * @example
 * formatDateOnly("2026-09-03") // "03/09/2026"
 * formatDateOnly(null) // ""
 */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

/**
 * Get today's date as ISO date-only string (YYYY-MM-DD) in local timezone.
 * 
 * Note: Uses Date components directly instead of toISOString() to avoid
 * UTC conversion issues near midnight.
 */
export function todayDateOnly(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Normalize a date string to YYYY-MM-DD format.
 * Accepts:
 * - Date-only: "2026-09-03"
 * - ISO with time: "2026-09-03T12:34:56.789Z"
 * 
 * For ISO strings, extracts the date part in the local timezone (not UTC).
 */
function normalizeDateOnly(iso: string): string {
  if (iso.includes("T")) {
    // ISO with time — convert to local date-only
    const d = new Date(iso)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }
  // Already date-only
  return iso
}

/**
 * Check if a date-only string represents a date before today.
 * Uses lexicographic string comparison (valid for YYYY-MM-DD format).
 * Accepts both date-only and ISO datetime strings.
 * 
 * @example
 * isOverdueDateOnly("2026-09-02") // true (if today is 2026-09-03)
 * isOverdueDateOnly("2026-09-03") // false (if today is 2026-09-03)
 * isOverdueDateOnly("2026-09-02T23:59:59Z") // true (if today is 2026-09-03)
 * isOverdueDateOnly(null) // false
 */
export function isOverdueDateOnly(due: string | null | undefined): boolean {
  if (!due) return false
  return normalizeDateOnly(due) < todayDateOnly()
}

/**
 * Check if a date-only string represents today's date.
 * Accepts both date-only and ISO datetime strings.
 * 
 * @example
 * isDueTodayDateOnly("2026-09-03") // true (if today is 2026-09-03)
 * isDueTodayDateOnly("2026-09-03T12:00:00Z") // true (if local date is 2026-09-03)
 * isDueTodayDateOnly("2026-09-02") // false
 */
export function isDueTodayDateOnly(due: string | null | undefined): boolean {
  if (!due) return false
  return normalizeDateOnly(due) === todayDateOnly()
}
