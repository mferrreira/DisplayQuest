-- plan-v16 S01: chave do arquivo de ícone no bucket. Nullable, sem backfill (padrão da casa).
ALTER TABLE "badges" ADD COLUMN "iconKey" TEXT;
