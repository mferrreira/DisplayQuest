/**
 * V5-1 (DEC-101) — port do bucket S3-compatible para os módulos.
 *
 * A camada `application` não importa `lib/` (RG-03 do G0), então o port declara os
 * próprios tipos; o adapter `infrastructure/adapters/s3-blob-store.ts` os cumpre sobre o
 * seam `lib/storage/blob-store.ts`. O V5-2 consome o port (logo/banner e anexos).
 */

export interface BlobPutInput {
  key: string
  body: Uint8Array
  contentType: string
}

export interface BlobMetadata {
  key: string
  size: number
  contentType: string | null
}

export interface BlobObject extends BlobMetadata {
  body: Uint8Array
}

export interface BlobStorePort {
  put(input: BlobPutInput): Promise<void>
  get(key: string): Promise<BlobObject | null>
  head(key: string): Promise<BlobMetadata | null>
  remove(key: string): Promise<void>
}
