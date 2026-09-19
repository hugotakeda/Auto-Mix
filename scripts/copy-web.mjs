import { cpSync, existsSync } from 'fs';

if (!existsSync('src/web/public')) {
    console.error('[AUTO MIX] src/web/public nao encontrado.');
    process.exit(1);
}

cpSync('src/web/public', 'dist/web/public', { recursive: true });
console.log('[AUTO MIX] Arquivos do site copiados para dist/web/public');
