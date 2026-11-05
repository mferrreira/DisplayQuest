import { Avatar, AvatarFallback, AvatarImage as AvatarElement } from "@/components/ui/avatar"
import { userImageUrl } from "@/lib/api/user-images"

interface BucketAvatarProps {
  userId: number
  avatarKey?: string | null
  legacyAvatar?: string | null
  name: string
  className?: string
  fallback: string
}

export function BucketAvatar({ userId, avatarKey, legacyAvatar, name, className, fallback }: BucketAvatarProps) {
  if (avatarKey) {
    return (
      <div className={`relative overflow-hidden rounded-full bg-muted ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={userImageUrl(userId, "avatar", avatarKey)} alt={name} className="absolute inset-0 h-full w-full rounded-full object-cover" />
      </div>
    )
  }
  return (
    <Avatar className={className}>
      <AvatarElement src={legacyAvatar || undefined} alt={name} />
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}
