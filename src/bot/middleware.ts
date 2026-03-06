/**
 * bot/middleware.ts
 * Middleware de autenticación para Grammy.
 * Valida que el usuario esté en la whitelist antes de procesar cualquier mensaje.
 */

import type { Context, NextFunction } from 'grammy';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware de whitelist de usuarios.
 * Bloquea cualquier interacción de usuarios no autorizados.
 */
export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
    const userId = ctx.from?.id;

    // Si no hay ID de usuario (mensajes de canal, etc.), rechazar
    if (!userId) {
        logger.warn('Mensaje recibido sin ID de usuario — ignorando');
        return;
    }

    const userIdStr = String(userId);
    const isAllowed = env.TELEGRAM_ALLOWED_USER_IDS.includes(userIdStr);

    if (!isAllowed) {
        logger.warn(`Acceso denegado al usuario: ${userId} (@${ctx.from?.username ?? 'desconocido'})`);
        await ctx.reply('⛔ No autorizado. Este bot es privado.');
        return;
    }

    // Usuario autorizado — continuar con el siguiente middleware/handler
    await next();
}
