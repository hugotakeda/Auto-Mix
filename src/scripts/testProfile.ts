import fs from 'fs';
import path from 'path';
import { generateProfileCard } from '../utils/canvasProfile.js';

async function main() {
    const mockProfile = {
        displayName: 'Fallen',
        role: 'AWPer',
        kd: 1.5,
        matchesPlayed: 25,
        totalKills: 450,
        totalDeaths: 300,
        wins: 20,
        losses: 5,
        gcLevel: 20,
        faceitLevel: '10',
        avatarBuffer: null
    };

    try {
        const buffer = await generateProfileCard(mockProfile);
        
        // Save to workspace root for easy viewing
        const outPath = path.join(process.cwd(), 'profile_preview.png');
        fs.writeFileSync(outPath, buffer);
        
        // Also save to artifact directory so we can embed it in a markdown file
        const artifactPath = '/Users/hugotakeda/.gemini/antigravity-ide/brain/fb2a17d5-a28b-4ece-a5c8-842d4b2f6235/profile_preview.png';
        fs.writeFileSync(artifactPath, buffer);

        console.log(`Preview gerado com sucesso em: ${outPath}`);
    } catch (error) {
        console.error('Erro ao gerar preview do perfil:', error);
    }
}

main();
