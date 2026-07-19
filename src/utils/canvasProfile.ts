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
                if (file.includes('BigShoulder')) {
                    GlobalFonts.registerFromPath(fontPath, 'Big Shoulders Display');
                } else if (file.includes('IBMPlexMono')) {
                    GlobalFonts.registerFromPath(fontPath, 'IBM Plex Mono');
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

// --- Color constants (from identity) ---
const INK = '#0B0D10';
const SURFACE = '#14171C';
const SURFACE_2 = '#1B2028';
const CT_BLUE = '#5B8FC7';
const T_AMBER = '#D98A3D';
const PAPER = '#EDEEF0';
const MUTED = '#8891A0';
const LINE = 'rgba(255,255,255,0.09)';

interface ProfileData {
    displayName: string;
    avatarBuffer: Buffer | null;
    role: string | null;
    kd: number;
    matchesPlayed: number;
    totalKills: number;
    totalDeaths: number;
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

function drawAutoMixLogo(ctx: SKRSContext2D, x: number, y: number, scale: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Left pentagon (CT Blue)
    ctx.fillStyle = CT_BLUE;
    ctx.beginPath();
    ctx.moveTo(20, 55);
    ctx.lineTo(65, 55);
    ctx.lineTo(90, 100);
    ctx.lineTo(65, 145);
    ctx.lineTo(20, 145);
    ctx.closePath();
    ctx.fill();

    // Right pentagon (T Amber)
    ctx.fillStyle = T_AMBER;
    ctx.beginPath();
    ctx.moveTo(180, 55);
    ctx.lineTo(135, 55);
    ctx.lineTo(110, 100);
    ctx.lineTo(135, 145);
    ctx.lineTo(180, 145);
    ctx.closePath();
    ctx.fill();

    // Center node
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(100, 100, 9, 0, Math.PI * 2);
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
    const HEIGHT = 420;
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

    // --- Left gradient border ---
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, CT_BLUE);
    grad.addColorStop(1, T_AMBER);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 5, HEIGHT);

    // --- Surface card ---
    ctx.fillStyle = SURFACE;
    roundRect(ctx, 24, 20, WIDTH - 48, HEIGHT - 40, 8);
    ctx.fill();

    // Inner border
    ctx.strokeStyle = LINE;
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

    // Avatar border gradient
    const avatarBorderGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX, avatarY + avatarSize);
    avatarBorderGrad.addColorStop(0, CT_BLUE);
    avatarBorderGrad.addColorStop(1, T_AMBER);
    ctx.strokeStyle = avatarBorderGrad;
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
    ctx.font = '800 40px "Big Shoulders Display", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(data.displayName.toUpperCase(), textX, 52);

    // --- Role badge ---
    const roleY = 100;
    const roleText = data.role ? data.role.toUpperCase() : 'SEM FUNCAO DEFINIDA';

    // Role background pill
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    const roleWidth = ctx.measureText(roleText).width + 24;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, textX, roleY, roleWidth, 26, 4);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.fillText(roleText, textX + 12, roleY + 7);

    // --- Separator line ---
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textX, 142);
    ctx.lineTo(WIDTH - 56, 142);
    ctx.stroke();

    // --- Stats Row ---
    const statsY = 160;
    const statSpacing = 170;

    const stats = [
        { label: 'K/D RATIO', value: data.kd.toFixed(2) },
        { label: 'PARTIDAS', value: String(data.matchesPlayed) },
        { label: 'ABATES', value: String(data.totalKills) },
        { label: 'MORTES', value: String(data.totalDeaths) },
    ];

    stats.forEach((stat, i) => {
        const x = textX + statSpacing * i;

        ctx.fillStyle = MUTED;
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(stat.label, x, statsY);

        ctx.fillStyle = PAPER;
        ctx.font = '800 44px "Big Shoulders Display", sans-serif';
        ctx.fillText(stat.value, x, statsY + 16);
    });

    // --- Separator line ---
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textX, 245);
    ctx.lineTo(WIDTH - 56, 245);
    ctx.stroke();

    // --- Levels Row ---
    const levelY = 263;

    // GC Level
    ctx.fillStyle = MUTED;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('GAMERSCLUB', textX, levelY);

    if (data.gcLevel) {
        const gcColor = getGCColor(data.gcLevel);

        // Level badge
        ctx.fillStyle = gcColor;
        roundRect(ctx, textX, levelY + 20, 120, 36, 4);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 16px "Big Shoulders Display", sans-serif';
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
        ctx.fillStyle = MUTED;
        ctx.font = '500 14px "IBM Plex Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText('N/A', textX + 14, levelY + 38);
        ctx.textBaseline = 'top';
    }

    // Faceit Level
    const faceitX = textX + 360;
    ctx.fillStyle = MUTED;
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('FACEIT', faceitX, levelY);

    if (data.faceitLevel) {
        const faceitColor = getFaceitColor(data.faceitLevel);

        // Level badge
        ctx.fillStyle = faceitColor;
        roundRect(ctx, faceitX, levelY + 20, 140, 36, 4);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 16px "Big Shoulders Display", sans-serif';
        ctx.textBaseline = 'middle';
        const faceitLabel = data.faceitLevel === 'Challenger' ? 'CHALLENGER' : `LEVEL ${data.faceitLevel}`;
        ctx.fillText(faceitLabel, faceitX + 14, levelY + 38);
        ctx.textBaseline = 'top';

        // Progress bar
        const faceitNum = data.faceitLevel === 'Challenger' ? 11 : parseInt(data.faceitLevel);
        ctx.fillStyle = faceitColor;
        ctx.globalAlpha = 0.2;
        roundRect(ctx, faceitX + 152, levelY + 28, 160, 20, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = faceitColor;
        const faceitBarWidth = Math.min(160, (faceitNum / 11) * 160);
        roundRect(ctx, faceitX + 152, levelY + 28, faceitBarWidth, 20, 3);
        ctx.fill();
    } else {
        ctx.fillStyle = SURFACE_2;
        roundRect(ctx, faceitX, levelY + 20, 140, 36, 4);
        ctx.fill();
        ctx.fillStyle = MUTED;
        ctx.font = '500 14px "IBM Plex Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText('N/A', faceitX + 14, levelY + 38);
        ctx.textBaseline = 'top';
    }

    // --- Auto Mix logo watermark (bottom-left, subtle) ---
    ctx.globalAlpha = 0.1;
    drawAutoMixLogo(ctx, 40, HEIGHT - 95, 0.35);
    ctx.globalAlpha = 1;

    // --- "AUTO MIX" text watermark (bottom-right) ---
    ctx.fillStyle = MUTED;
    ctx.globalAlpha = 0.3;
    ctx.font = '800 14px "Big Shoulders Display", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('AUTO MIX', WIDTH - 110, HEIGHT - 30);
    ctx.globalAlpha = 1;

    // --- Bottom accent bars ---
    ctx.fillStyle = CT_BLUE;
    ctx.fillRect(24, HEIGHT - 24, (WIDTH - 48) / 2, 4);
    ctx.fillStyle = T_AMBER;
    ctx.fillRect(24 + (WIDTH - 48) / 2, HEIGHT - 24, (WIDTH - 48) / 2, 4);

    return canvas.toBuffer('image/png');
}
