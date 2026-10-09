/**
 * Notification — pure domain contract of the notification aggregate (SPEC §2, §4.5; OND1-B1).
 *
 * `data` is `unknown` on purpose: the current gateway persists `JSON.stringify(command.data)`
 * into the String column and returns the column value UNPARSED (raw string) — frozen by the
 * golden matrix (tests/unit/modules/notifications/golden.notifications.test.ts). Decoding the
 * envelope is an adapter decision, not a domain decision.
 *
 * `createdAt`/`readAt` are ISO strings because that is exactly what the gateway mapping
 * produces today (`x.toISOString()` / `null`) and the HTTP adapters serialize that shape
 * (DEC-12 parity: no payload reshaping in the pilot).
 */
export interface INotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  data: unknown;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

export type Notification = INotification;

/** Audience vocabulary of `publishEvent` (moved verbatim from the application contracts). */
export interface NotificationAudienceUserIds {
  mode: "USER_IDS";
  userIds: number[];
}

export interface NotificationAudienceAllActive {
  mode: "ALL_ACTIVE_USERS";
}

export type NotificationAudience = NotificationAudienceUserIds | NotificationAudienceAllActive;

export const NOTIFICATION_AUDIENCE_MODES = ["USER_IDS", "ALL_ACTIVE_USERS"] as const;

export type NotificationAudienceMode = (typeof NOTIFICATION_AUDIENCE_MODES)[number];

export function isNotificationAudienceMode(value: unknown): value is NotificationAudienceMode {
  return (
    typeof value === "string" &&
    (NOTIFICATION_AUDIENCE_MODES as readonly string[]).includes(value)
  );
}
