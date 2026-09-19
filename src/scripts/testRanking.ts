import fs from 'fs';
import path from 'path';
import { generateRankingCard, type RankingPlayer } from '../utils/canvasRanking.js';

async function main() {
    const mockPlayers: RankingPlayer[] = [];
    for (let i = 0; i < 10; i++) {
        mockPlayers.push({
            user_id: String(i + 1),
            guild_id: '1',
            role: i % 2 === 0 ? 'Duelista' : 'Suporte',
            displayName: `Player ${i + 1}`,
            total_kills: 500 - (i * 20),
            total_deaths: 300 + (i * 10),
            matches_played: 25 - i,
            wins: 20 - i,
            losses: 5,
            avatarBuffer: null
        });
    }

    try {
        const buffer = await generateRankingCard(mockPlayers);
        // Save to artifacts directory
        const outPath = '/Users/hugotakeda/.gemini/antigravity-ide/brain/fb2a17d5-a28b-4ece-a5c8-842d4b2f6235/ranking_preview.png';
        fs.writeFileSync(outPath, buffer);
        console.log(`Preview gerado com sucesso em: ${outPath}`);
    } catch (error) {
        console.error('Erro ao gerar preview:', error);
    }
}

main();
