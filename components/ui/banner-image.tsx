/** Shared image renderer for project/profile banners and logos. */
interface BannerImageProps {
  src: string
  alt: string
  className?: string
}

export function BannerImage({ src, alt, className }: BannerImageProps) {
  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
    </div>
  )
}
