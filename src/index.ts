/**
 * index.ts
 * Punto de entrada del bot — inicializa todos los sistemas y arranca el bot.
 */

// La importación de env.ts carga dotenv y valida las variables en el acto
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './memory/database.js';
import { registerTool } from './tools/registry.js';
import { getCurrentTimeTool } from './tools/implementations/get-current-time.js';
import { createBot } from './bot/telegram.js';

/**
 * Registra todas las herramientas disponibles para el agente.
 * Para añadir una nueva tool: importarla aquí y llamar a registerTool().
 */
function initializeTools(): void {
    registerTool(getCurrentTimeTool);
    logger.info('Herramientas registradas correctamente');
}

/**
 * Handler de shutdown controlado.
 * Cierra la conexión a SQLite antes de terminar el proceso.
 */
function setupGracefulShutdown(stopBot: () => Promise<void>): void {
    const shutdown = async (signal: string) => {
        logger.info(`Señal ${signal} recibida — cerrando bot...`);
        try {
            await stopBot();
            closeDatabase();
            logger.info('Bot detenido correctamente. ¡Hasta pronto! 👋');
        } catch (error) {
            logger.error('Error durante el shutdown:', error);
        }
        process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/**
 * Función principal de arranque del bot.
 */
async function main(): Promise<void> {
    logger.info('═══════════════════════════════════════');
    logger.info('  LasgostAI Bot — Iniciando...');
    logger.info('═══════════════════════════════════════');
    logger.info(`Nivel de log: ${env.LOG_LEVEL}`);
    logger.info(`Max iteraciones del agente: ${env.AGENT_MAX_ITERATIONS}`);
    logger.info(`LLM principal: ${env.GROQ_MODEL}`);
    logger.info(`LLM fallback: ${env.OPENROUTER_MODEL}`);

    // [1] Inicializar base de datos (async — carga el WASM de sql.js)
    await initDatabase();

    // [2] Registrar herramientas
    initializeTools();

    // [3] Crear e iniciar el bot
    const bot = createBot();

    // [3.5] Si estamos en Vercel, no hacemos Long Polling, cedemos el control a api/webhook.ts
    if (process.env.VERCEL || process.env.VERCEL_ENV) {
        logger.info('⚡ Entorno Vercel detectado. Omitiendo Long Polling.');
        logger.info('El bot funcionará vía Webhooks en /api/webhook.');
        return;
    }

    // [4] Configurar shutdown controlado
    setupGracefulShutdown(() => bot.stop());

    // [5] Iniciar long polling local
    logger.info('Iniciando long polling de Telegram...');
    await bot.start({
        onStart: (botInfo) => {
            logger.info(`✅ Bot activo: @${botInfo.username} (ID: ${botInfo.id})`);
            logger.info('Esperando mensajes...');
        },
    });
}

// Arrancar el bot
main().catch((error) => {
    logger.error('Error fatal al iniciar el bot:', error);
    process.exit(1);
});
