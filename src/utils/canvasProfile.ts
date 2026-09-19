import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { getGCColor, getFaceitColor } from './levelColors.js';
import path from 'path';
import fs from 'fs';

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
const SURFACE = '#212124';    // Grafite claro — superfície / cards
const SURFACE_2 = '#26262A';  // superfície elevada (avatar, badges vazios)
const BORDER = '#2C2C2F';     // Borda — divisores e contornos
const PAPER = '#FAFAFA';      // Branco gelo — texto principal
const MUTED = '#A6A6A9';      // Cinza médio — texto secundário
const TEXT_MUTED = '#6F6F73'; // texto terciário / labels em mono
const ACCENT = '#3ECF8E';     // Menta — acento, status e ação
const ACCENT_INK = '#08281A'; // texto escuro sobre fundo menta
const BAD = '#E5675F';        // vermelho de estado — erro / negativo

interface ProfileData {
    displayName: string;
    avatarBuffer: Buffer | null;
    role: string | null;
    kd: number;
    matchesPlayed: number;
    totalKills: number;
    totalDeaths: number;
    wins: number;
    losses: number;
    gcLevel: number | null;
    faceitLevel: string | null;
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

function drawAvatarPlaceholder(ctx: SKRSContext2D, cx: number, cy: number, radius: number): void {
    // Dark circle background
    ctx.fillStyle = SURFACE_2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // User silhouette
    ctx.fillStyle = 'rgba(255,255,255,0.12)';

    // Head
    ctx.beginPath();
    ctx.arc(cx, cy - radius * 0.15, radius * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.ellipse(cx, cy + radius * 0.45, radius * 0.42, radius * 0.32, 0, Math.PI, 0);
    ctx.fill();
}

export async function generateProfileCard(data: ProfileData): Promise<Buffer> {
    const WIDTH = 950;
    const HEIGHT = 490;
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

    // --- Surface card ---
    ctx.fillStyle = SURFACE;
    roundRect(ctx, 24, 20, WIDTH - 48, HEIGHT - 40, 8);
    ctx.fill();

    // Inner border
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    roundRect(ctx, 24, 20, WIDTH - 48, HEIGHT - 40, 8);
    ctx.stroke();

    // --- Avatar ---
    const avatarX = 56;
    const avatarY = 60;
    const avatarSize = 140;
    const avatarCenterX = avatarX + avatarSize / 2;
    const avatarCenterY = avatarY + avatarSize / 2;

    // Avatar background circle
    ctx.fillStyle = SURFACE_2;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 3, 0, Math.PI * 2);
    ctx.fill();

    // Avatar border (acento único)
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 3, 0, Math.PI * 2);
    ctx.stroke();

    if (data.avatarBuffer) {
        try {
            const { loadImage } = await import('@napi-rs/canvas');
            const avatarImage = await loadImage(data.avatarBuffer);
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        } catch {
            drawAvatarPlaceholder(ctx, avatarCenterX, avatarCenterY, avatarSize / 2);
        }
    } else {
        drawAvatarPlaceholder(ctx, avatarCenterX, avatarCenterY, avatarSize / 2);
    }

    // --- Display Name ---
    const textX = 230;
    ctx.fillStyle = PAPER;
    ctx.font = '800 40px "Sora", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(data.displayName.toUpperCase(), textX, 52);

    // --- Role badge ---
    const roleY = 100;
    const roleText = data.role ? data.role.toUpperCase() : 'SEM FUNCAO DEFINIDA';

    // Role background pill
    ctx.font = '500 13px "JetBrains Mono", monospace';
    const roleWidth = ctx.measureText(roleText).width + 24;
    ctx.fillStyle = SURFACE_2;
    roundRect(ctx, textX, roleY, roleWidth, 26, 4);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.fillText(roleText, textX + 12, roleY + 7);

    // --- Separator line ---
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textX, 142);
    ctx.lineTo(WIDTH - 56, 142);
    ctx.stroke();

    // --- Stats Row ---
    const statsY = 158;
    const statSpacing = 160;
    const rowSpacing = 70;

    const stats = [
        { label: 'K/D RATIO', value: data.kd.toFixed(2), color: PAPER },
        { label: 'ABATES', value: String(data.totalKills), color: PAPER },
        { label: 'MORTES', value: String(data.totalDeaths), color: PAPER },
        { label: 'PARTIDAS', value: String(data.matchesPlayed), color: PAPER },
        { label: 'VITÓRIAS', value: String(data.wins), color: PAPER },
        { label: 'DERROTAS', value: String(data.losses), color: PAPER },
    ];

    stats.forEach((stat, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = textX + statSpacing * col;
        const y = statsY + rowSpacing * row;

        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(stat.label, x, y);

        ctx.fillStyle = stat.color;
        ctx.font = '800 44px "Sora", sans-serif';
        ctx.fillText(stat.value, x, y + 16);
    });

    // --- Separator line ---
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textX, 310);
    ctx.lineTo(WIDTH - 56, 310);
    ctx.stroke();

    // --- Levels Row ---
    const levelY = 328;

    // GC Level
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('GAMERSCLUB', textX, levelY);

    if (data.gcLevel) {
        const gcColor = getGCColor(data.gcLevel);

        // Level badge
        ctx.fillStyle = gcColor;
        roundRect(ctx, textX, levelY + 20, 120, 36, 4);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 16px "Sora", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(`LEVEL ${data.gcLevel}`, textX + 14, levelY + 38);
        ctx.textBaseline = 'top';

        // Progress bar
        ctx.fillStyle = gcColor;
        ctx.globalAlpha = 0.2;
        roundRect(ctx, textX + 132, levelY + 28, 160, 20, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = gcColor;
        const gcBarWidth = Math.min(160, (data.gcLevel / 21) * 160);
        roundRect(ctx, textX + 132, levelY + 28, gcBarWidth, 20, 3);
        ctx.fill();
    } else {
        ctx.fillStyle = SURFACE_2;
        roundRect(ctx, textX, levelY + 20, 120, 36, 4);
        ctx.fill();
        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '500 14px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText('N/A', textX + 14, levelY + 38);
        ctx.textBaseline = 'top';
    }

    // Faceit Level
    const faceitX = textX + 360;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('FACEIT', faceitX, levelY);

    if (data.faceitLevel) {
        const faceitColor = getFaceitColor(data.faceitLevel);

        // Level badge
        ctx.fillStyle = faceitColor;
        roundRect(ctx, faceitX, levelY + 20, 140, 36, 4);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 16px "Sora", sans-serif';
        ctx.textBaseline = 'middle';
        const faceitLabel = data.faceitLevel === 'Challenger' ? 'CHALLENGER' : `LEVEL ${data.faceitLevel}`;
        ctx.fillText(faceitLabel, faceitX + 14, levelY + 38);
        ctx.textBaseline = 'top';

        // Progress bar
        const faceitNum = data.faceitLevel === 'Challenger' ? 10 : parseInt(data.faceitLevel);
        ctx.fillStyle = faceitColor;
        ctx.globalAlpha = 0.2;
        roundRect(ctx, faceitX + 152, levelY + 28, 160, 20, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = faceitColor;
        const faceitBarWidth = Math.min(160, (faceitNum / 10) * 160);
        roundRect(ctx, faceitX + 152, levelY + 28, faceitBarWidth, 20, 3);
        ctx.fill();
    } else {
        ctx.fillStyle = SURFACE_2;
        roundRect(ctx, faceitX, levelY + 20, 140, 36, 4);
        ctx.fill();
        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '500 14px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText('N/A', faceitX + 14, levelY + 38);
        ctx.textBaseline = 'top';
    }

    // --- Auto mark watermark (top-right, subtle, aligned with player name)
    ctx.globalAlpha = 0.12;
    drawAutoMark(ctx, WIDTH - 130, 65, 0.22);
    ctx.globalAlpha = 1;

    // --- "AUTO MIX" text watermark (bottom-right) ---
    ctx.fillStyle = TEXT_MUTED;
    ctx.globalAlpha = 0.5;
    ctx.font = '800 14px "Sora", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('AUTO MIX', WIDTH - 110, HEIGHT - 30);
    ctx.globalAlpha = 1;

    // Bottom accent bar removed as requested

    return canvas.toBuffer('image/png');
}