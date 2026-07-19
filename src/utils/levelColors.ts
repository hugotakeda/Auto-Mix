export const GC_LEVEL_COLORS: Record<number, string> = {
    1:  '#8f19c0',
    2:  '#6419bd',
    3:  '#4e139f',
    4:  '#2d0d5e',
    5:  '#072660',
    6:  '#0d3a95',
    7:  '#0c388e',
    8:  '#0c4ab6',
    9:  '#2c67cb',
    10: '#2765e5',
    11: '#328fc1',
    12: '#328fc1',
    13: '#30a546',
    14: '#34b52b',
    15: '#2be518',
    16: '#e3d42d',
    17: '#dea928',
    18: '#f98d24',
    19: '#fd6419',
    20: '#f40102',
    21: '#daa520',
};

export const FACEIT_LEVEL_COLORS: Record<string, string> = {
    '1':          '#dddddd',
    '2':          '#47e36e',
    '3':          '#47e36e',
    '4':          '#ff6c20',
    '5':          '#ff6c20',
    '6':          '#ff6c20',
    '7':          '#ff6c20',
    '8':          '#ff6c20',
    '9':          '#ff6c20',
    '10':         '#e80128',
    'Challenger': '#db0227',
};

export function getGCColor(level: number): string {
    return GC_LEVEL_COLORS[level] ?? '#8891A0';
}

export function getFaceitColor(level: string): string {
    return FACEIT_LEVEL_COLORS[level] ?? '#8891A0';
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 0, g: 0, b: 0 };
    return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    };
}

export function hexToDiscordColor(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}
