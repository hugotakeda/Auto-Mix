/**
 * Ponte entre o site e o bot para o que so o Discord sabe responder:
 * quem tem o cargo de staff, e banir alguem do servidor.
 *
 * Fica separado para o servidor web nao depender de discord.js — o index.ts
 * injeta a implementacao real no boot.
 */

import type { Request, Response, NextFunction } from 'express';

export interface BanOutcome {
    ok: boolean;
    /** Mensagem pronta para mostrar pra staff no site. */
    message: string;
}

export interface StaffHooks {
    /** O membro tem o cargo de STAFF_ROLE_ID neste servidor? */
    isStaff(discordUserId: string): boolean;
    /** Bane o membro do servidor do Discord. */
    banFromDiscord(discordUserId: string, reason: string): Promise<BanOutcome>;
    /** Remove o banimento. */
    unbanFromDiscord(discordUserId: string): Promise<BanOutcome>;
}

let hooks: StaffHooks | null = null;

export function setStaffHooks(value: StaffHooks): void {
    hooks = value;
}

export function staffHooks(): StaffHooks | null {
    return hooks;
}

/**
 * Se e staff e verificado a cada requisicao, nao guardado no cookie.
 *
 * A sessao dura 7 dias: gravar no cookie faria alguem que saiu da staff
 * continuar com acesso de staff por ate uma semana.
 */
export function isStaffUser(discordUserId: string | undefined): boolean {
    if (!discordUserId || !hooks) return false;

    try {
        return hooks.isStaff(discordUserId);
    } catch {
        return false;
    }
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ error: 'Faca login para continuar.' });
        return;
    }

    if (!isStaffUser(req.user.id)) {
        // 404 em vez de 403: para quem nao e staff, estas rotas nao existem.
        res.status(404).json({ error: 'Rota nao encontrada.' });
        return;
    }

    next();
}
