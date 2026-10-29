import {
  blobStoreConfigFromEnv,
  createS3BlobStore,
  type BlobStore,
  type BlobStoreConfig,
} from "@/lib/storage/blob-store"
import type {
  BlobMetadata,
  BlobObject,
  BlobPutInput,
  BlobStorePort,
} from "@/backend/modules/project-management/application/ports/blob-store.port"

/**
 * V5-1 (DEC-101) — adapter do port de blobs sobre o seam `lib/storage/blob-store.ts`.
 * Mesmo desenho de `ReportUploadsStorage` sobre `lib/storage/report-uploads.ts`: a
 * application não toca o SDK, o adapter é fino e o teste mocka a lib (gotcha A11).
 *
 * Sem consumidor de produção no V5-1 — o V5-2 injeta o port na criação do módulo.
 */
export class S3BlobStoreAdapter implements BlobStorePort {
  constructor(private readonly store: BlobStore) {}

  async put(input: BlobPutInput): Promise<void> {
    await this.store.put(input.key, input.body, input.contentType)
  }

  async get(key: string): Promise<BlobObject | null> {
    return await this.store.get(key)
  }

  async head(key: string): Promise<BlobMetadata | null> {
    return await this.store.head(key)
  }

  async remove(key: string): Promise<void> {
    await this.store.remove(key)
  }
}

export interface CreateS3BlobStorePortOptions {
  env?: Record<string, string | undefined>
  /** Seam de teste: quando presente, nenhum cliente S3 é criado. */
  store?: BlobStore
  config?: BlobStoreConfig | null
}

export function createS3BlobStorePort(options: CreateS3BlobStorePortOptions = {}): BlobStorePort {
  if (options.store) return new S3BlobStoreAdapter(options.store)

  const config = options.config ?? blobStoreConfigFromEnv(options.env ?? process.env)
  if (!config) {
    throw new Error(
      "Bucket S3 não configurado — defina S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY e S3_BUCKET",
    )
  }
  return new S3BlobStoreAdapter(createS3BlobStore(config))
}
