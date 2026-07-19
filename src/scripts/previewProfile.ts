import { generateProfileCard } from '../utils/canvasProfile.js';
import fs from 'fs';
import path from 'path';

async function main() {
    console.log('[PREVIEW] Gerando card de perfil de exemplo...');

    const imageBuffer = await generateProfileCard({
        displayName: 'HugoT',
        avatarBuffer: null,
        role: 'Entry Fragger',
        kd: 1.45,
        matchesPlayed: 27,
        totalKills: 583,
        totalDeaths: 402,
        gcLevel: 15,
        faceitLevel: '7',
    });

    const outputPath = path.join(process.cwd(), 'perfil_preview.png');
    fs.writeFileSync(outputPath, imageBuffer);
    console.log(`[PREVIEW] Card salvo em: ${outputPath}`);
}

main().catch(console.error);
