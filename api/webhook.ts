/**
 * api/webhook.ts
 * Endpoint Serverless para Vercel.
 * Telegram enviará las actualizaciones a esta URL.
 */

import { webhookCallback } from 'grammy';
import { createBot } from '../src/bot/telegram.js';
import { initDatabase } from '../src/memory/database.js';
import { env } from '../src/config/env.js';

// Inicializar la base de datos de forma global y perezosa (lazy)
// Esto aprovecha el caché de Vercel entre ejecuciones (cold starts)
let dbPromise: Promise<void> | null = null;

export default async function handler(req: any, res: any) {
    // Asegurarnos de tener conectada la base de datos antes de procesar el webhook
    if (!dbPromise) {
        dbPromise = initDatabase();
    }
    await dbPromise;

    // Creamos la instancia del bot
    const bot = createBot();

    // grammy se encarga de parsear el request, ejecutar el agent loop 
    // y responder HTTP 200 OK a Telegram
    const cb = webhookCallback(bot, 'http');

    // Ejecutamos el callback oficial adaptado a la firma de Vercel/Node
    return cb(req, res);
}
