import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

export class ImageProcessor {
  private static readonly DEFAULT_OPTIONS: Required<ImageProcessingOptions> = {
    width: 300,
    height: 300,
    quality: 80,
    format: 'webp'
  };

  static async processAndSave(
    file: File,
    userId: number,
    options: Partial<ImageProcessingOptions> = {}
  ): Promise<string> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    
    if (!file.type.startsWith('image/')) {
      throw new Error('Apenas arquivos de imagem são permitidos');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Arquivo muito grande. Máximo 5MB');
    }

    const userDir = join(process.cwd(), 'public', 'uploads', 'avatars', userId.toString());
    if (!existsSync(userDir)) {
      await mkdir(userDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `avatar_${timestamp}.${opts.format}`;
    const filePath = join(userDir, filename);

    try {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const processedBuffer = await sharp(buffer)
        .resize(opts.width, opts.height, {
          fit: 'cover',
          position: 'center'
        })
        .toFormat(opts.format, {
          quality: opts.quality
        })
        .toBuffer();

      await writeFile(filePath, processedBuffer);

      // URL servida pela rota app/api/uploads/avatars/[...]/route.ts, que lê do
      // disco a cada request. O serving estático de public/ não enxerga arquivos
      // criados em runtime sem restart (cache de boot do standalone).
      return `/api/uploads/avatars/${userId}/${filename}`;
    } catch (error) {
      console.error('Error processing image:', error);
      throw new Error('Erro ao processar imagem');
    }
  }

  static async deleteImage(imagePath: string): Promise<void> {
    try {
      // Aceita as duas formas de URL gravadas no banco: /uploads/avatars/...
      // (legado) e /api/uploads/avatars/... (nova). Extrai o caminho relativo
      // a public/ a partir do marcador /uploads/.
      const marker = '/uploads/';
      const markerIndex = imagePath.indexOf(marker);
      if (markerIndex === -1) return;

      const relative = imagePath.slice(markerIndex + 1);
      const fullPath = join(process.cwd(), 'public', relative);
      if (existsSync(fullPath)) {
        const { unlink } = await import('fs/promises');
        await unlink(fullPath);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }

  static async getImageMetadata(file: File): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
  }> {
    try {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const metadata = await sharp(buffer).metadata();
      
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown',
        size: file.size
      };
    } catch (error) {
      console.error('Error getting image metadata:', error);
      throw new Error('Erro ao obter metadados da imagem');
    }
  }

  static validateImage(file: File): { valid: boolean; error?: string } {
    if (!file.type.startsWith('image/')) {
      return { valid: false, error: 'Apenas arquivos de imagem são permitidos' };
    }

    if (file.size > 5 * 1024 * 1024) {
      return { valid: false, error: 'Arquivo muito grande. Máximo 5MB' };
    }

    if (file.size < 1024) {
      return { valid: false, error: 'Arquivo muito pequeno' };
    }

    return { valid: true };
  }
}
