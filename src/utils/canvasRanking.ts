import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import type { PlayerData } from './database.js';

// Register fonts if available
const fontsDir = path.join(process.cwd(), 'src', 'assets', 'fonts');

function registerFonts(): void {
    try {
        if (fs.existsSync(fontsDir)) {
            const fontFiles = fs.readdirSync(fontsDir);
            for (const file of fontFiles) {
                const fontPath = path.join(fontsDir, file);
                if (file.includes('Sora')) {
                    GlobalFonts.registerFromPath(fontPath, 'Sora');
                } else if (file.includes('JetBrainsMono') || file.includes('JetBrains-Mono') || file.includes('JetBrains_Mono')) {
                    GlobalFonts.registerFromPath(fontPath, 'JetBrains Mono');
                } else if (file.includes('Inter')) {
                    GlobalFonts.registerFromPath(fontPath, 'Inter');
                }
            }
        }
    } catch {
        // Fonts not available — use fallback
    }
}

registerFonts();

// --- Color constants (identidade visual "Auto" — paleta neutra, um único acento) ---
const INK = '#1C1C1E';        // Grafite — fundo base
const SURFACE_2 = '#26262A';  // superfície elevada (avatar)
const BORDER = '#2C2C2F';     // Borda — divisores e contornos
const PAPER = '#FAFAFA';      // Branco gelo — texto principal
const MUTED = '#A6A6A9';      // Cinza médio — texto secundário
const TEXT_MUTED = '#6F6F73'; // texto terciário / labels em mono
const ACCENT = '#3ECF8E';     // Menta — acento, status e ação
const SILVER = '#C0C0C0';     // 2º lugar — metáfora de medalha, neutro
const BRONZE = '#CD7F32';     // 3º lugar — metáfora de medalha, neutro

export interface RankingPlayer extends PlayerData {
    displayName: string;
    avatarBuffer: Buffer | null;
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Desenha o mark oficial da identidade "Auto": dois arcos formando um anel
 * quebrado + duas setas triangulares (uma em branco-gelo, uma em menta),
 * replicando a construção geométrica do símbolo (raio 150/256, traço 39/512).
 */
function drawAutoMark(ctx: SKRSContext2D, x: number, y: number, scale: number): void {
    const minX = 89.3;
    const minY = 171.1;

    ctx.save();
    ctx.translate(x - minX * scale, y - minY * scale);
    ctx.scale(scale, scale);

    const cx = 256;
    const cy = 256;
    const r = 150;

    ctx.lineCap = 'round';
    ctx.lineWidth = 39;
    ctx.strokeStyle = PAPER;

    // Arco inferior
    ctx.beginPath();
    ctx.arc(cx, cy, r, (27 * Math.PI) / 180, (153 * Math.PI) / 180);
    ctx.stroke();

    // Arco superior
    ctx.beginPath();
    ctx.arc(cx, cy, r, (207 * Math.PI) / 180, (333 * Math.PI) / 180);
    ctx.stroke();

    // Ponta de seta — branco gelo
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(98.4, 277.2);
    ctx.lineTo(155.4, 307.3);
    ctx.lineTo(89.3, 340.9);
    ctx.closePath();
    ctx.fill();

    // Ponta de seta — menta (acento)
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(413.6, 234.8);
    ctx.lineTo(356.6, 204.7);
    ctx.lineTo(422.7, 171.1);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

export async function generateRankingCard(players: RankingPlayer[]): Promise<Buffer> {
    const WIDTH = 800;
    // Calculate height based on number of players (min 1, max 5 usually)
    const rowHeight = 80;
    const headerHeight = 120;
    const padding = 40;
    const HEIGHT = headerHeight + (players.length * rowHeight) + padding;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // --- Background ---
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Subtle dot pattern
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let px = 0; px < WIDTH; px += 26) {
        for (let py = 0; py < HEIGHT; py += 26) {
            ctx.beginPath();
            ctx.arc(px + 1, py + 1, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- Left accent border (acento único) ---
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, 5, HEIGHT);

    // --- Header ---
    ctx.fillStyle = PAPER;
    ctx.font = '800 48px "Sora", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('RANKING', 40, 40);

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillText('AUTO MIX - ATUALIZAÇÃO QUINZENAL', 40, 90);

    // Header Separator
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 115);
    ctx.lineTo(WIDTH - 40, 115);
    ctx.stroke();

    // --- Draw Players ---
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const y = headerHeight + 20 + (i * rowHeight);

        // Rank Number
        const rankColor = i === 0 ? ACCENT : (i === 1 ? SILVER : (i === 2 ? BRONZE : TEXT_MUTED));
        ctx.fillStyle = rankColor;
        ctx.font = '800 36px "Sora", sans-serif';
        ctx.fillText(`#${i + 1}`, 40, y + 15);

        // Avatar
        const avatarSize = 50;
        const avatarX = 110;
        const avatarY = y + 10;
        const avatarCenterX = avatarX + avatarSize / 2;
        const avatarCenterY = avatarY + avatarSize / 2;

        ctx.fillStyle = SURFACE_2;
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();

        if (player.avatarBuffer) {
            try {
                const { loadImage } = await import('@napi-rs/canvas');
                const avatarImage = await loadImage(player.avatarBuffer);
                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
                ctx.restore();
            } catch {
                // Ignore error, draw nothing
            }
        }

        // Display Name
        ctx.fillStyle = PAPER;
        ctx.font = '800 24px "Sora", sans-serif';
        ctx.fillText(player.displayName.toUpperCase(), 180, y + 20);

        // Stats
        const statsX = 520;
        const kdRatio = player.total_deaths === 0 ? player.total_kills.toFixed(2) : (player.total_kills / player.total_deaths).toFixed(2);

        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '500 12px "JetBrains Mono", monospace';

        ctx.fillText('KILLS', statsX, y + 15);
        ctx.fillText('K/D', statsX + 100, y + 15);
        ctx.fillText('PARTIDAS', statsX + 180, y + 15);

        ctx.fillStyle = PAPER;
        ctx.font = '800 22px "Sora", sans-serif';
        ctx.fillText(String(player.total_kills), statsX, y + 35);
        ctx.fillText(kdRatio, statsX + 100, y + 35);
        ctx.fillText(String(player.matches_played), statsX + 180, y + 35);

        // Row Separator
        if (i < players.length - 1) {
            ctx.strokeStyle = BORDER;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(110, y + rowHeight - 5);
            ctx.lineTo(WIDTH - 40, y + rowHeight - 5);
            ctx.stroke();
        }
    }

    // --- Watermark (alinhado verticalmente ao título "RANKING TOP PLAYERS") ---
    ctx.globalAlpha = 0.18;
    drawAutoMark(ctx, WIDTH - 90, 45, 0.15);
    ctx.globalAlpha = 1;

    return canvas.toBuffer('image/png');
}