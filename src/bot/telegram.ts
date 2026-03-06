/**
 * bot/telegram.ts
 * Configuración de Grammy + handlers de comandos y mensajes.
 * Esta capa solo gestiona la comunicación con Telegram.
 * La lógica de negocio vive en el agent loop, que es agnóstico al canal.
 */

import { Bot, GrammyError, HttpError } from 'grammy';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { authMiddleware } from './middleware.js';
import { safeRunAgentLoop } from '../agent/agent-loop.js';
import {
    clearHistory,
    getRecentMemories,
    countMemories,
} from '../memory/memory-manager.js';
import {
    downloadTelegramFile,
    transcribeAudioGroq,
    downloadTelegramFileAsBase64,
    generateSpeechElevenLabs
} from './media.js';
import { InputFile } from 'grammy';

// Tiempo de inicio para calcular uptime
const startTime = Date.now();

/**
 * Crea y configura la instancia del bot de Grammy.
 */
export function createBot(): Bot {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

    // ----- Middleware global -----
    // La autenticación se aplica a TODOS los mensajes antes de cualquier handler
    bot.use(authMiddleware);

    // ----- Comandos -----

    /**
     * /start — Mensaje de bienvenida
     */
    bot.command('start', async (ctx) => {
        const username = ctx.from?.first_name ?? 'usuario';
        await ctx.reply(
            `👋 ¡Hola, ${username}! Soy *LasgostAI*, tu asistente personal de IA.\n\n` +
            `Puedo ayudarte con preguntas, recordar información importante y usar herramientas para obtener datos reales.\n\n` +
            `Escríbeme cualquier cosa o usa /help para ver los comandos disponibles.`,
            { parse_mode: 'Markdown' },
        );
    });

    /**
     * /help — Lista de comandos disponibles
     */
    bot.command('help', async (ctx) => {
        await ctx.reply(
            `📋 *Comandos disponibles:*\n\n` +
            `• /start — Mensaje de bienvenida\n` +
            `• /help — Esta ayuda\n` +
            `• /clear — Borrar historial de conversación\n` +
            `• /memory — Ver memorias guardadas\n` +
            `• /status — Estado del bot\n\n` +
            `_Simplemente escríbeme para chatear o hacerme preguntas._`,
            { parse_mode: 'Markdown' },
        );
    });

    /**
     * /clear — Limpiar historial de conversación
     */
    bot.command('clear', async (ctx) => {
        const userId = String(ctx.from!.id);
        const deleted = await clearHistory(userId);
        await ctx.reply(
            `🗑️ Historial borrado. Se eliminaron ${deleted} mensajes.\n` +
            `Empezamos desde cero — ¡hola! 👋`,
        );
    });

    /**
     * /memory — Mostrar memorias guardadas del usuario
     */
    bot.command('memory', async (ctx) => {
        const userId = String(ctx.from!.id);
        const memories = await getRecentMemories(userId, 10);

        if (memories.length === 0) {
            await ctx.reply('🧠 No tengo memorias guardadas sobre ti todavía.');
            return;
        }

        const memoryList = memories
            .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
            .join('\n');

        await ctx.reply(
            `🧠 *Mis memorias sobre ti (últimas ${memories.length}):*\n\n${memoryList}`,
            { parse_mode: 'Markdown' },
        );
    });

    /**
     * /status — Estado del bot (uptime, stats, proveedor activo)
     */
    bot.command('status', async (ctx) => {
        const userId = String(ctx.from!.id);
        const uptimeMs = Date.now() - startTime;
        const uptimeMin = Math.floor(uptimeMs / 60000);
        const uptimeSec = Math.floor((uptimeMs % 60000) / 1000);
        const memoryCount = await countMemories(userId);

        await ctx.reply(
            `📊 *Estado de LasgostAI*\n\n` +
            `⏱️ Uptime: ${uptimeMin}m ${uptimeSec}s\n` +
            `🧠 Memorias guardadas: ${memoryCount}\n` +
            `🤖 LLM Principal: ${env.GROQ_MODEL}\n` +
            `🔄 LLM Fallback: ${env.OPENROUTER_MODEL}\n` +
            `📝 Historial máximo: 20 mensajes`,
            { parse_mode: 'Markdown' },
        );
    });

    // ----- Handlers de Mensajes y Multimedia -----

    /**
     * Handler para notas de voz y archivos de audio enviados al bot.
     * Transcribe el audio con Groq Whisper y pasa el texto resultante al Agent Loop.
     */
    bot.on(['message:voice', 'message:audio'], async (ctx) => {
        const userId = String(ctx.from!.id);

        // Telegram puede mandar esto como voice (nota de voz de cel) o audio (archivo ogg/mp3/etc)
        const fileObj = ctx.message.voice || ctx.message.audio;

        if (!fileObj) return;

        logger.info(`Audio recibido de ${userId}. Procesando transcripción...`);
        let tempMessage;

        try {
            // Avisar al usuario que estamos procesando su audio
            tempMessage = await ctx.reply('🎧 _Escuchando tu audio..._', { parse_mode: 'Markdown' });
            await ctx.replyWithChatAction('typing');

            // 1. Obtener la ruta del archivo de Telegram via Bot API
            const fileInfo = await ctx.api.getFile(fileObj.file_id);
            if (!fileInfo.file_path) {
                throw new Error('Telegram no devolvió la ruta del archivo (file_path).');
            }

            // 2. Descargar el archivo localmente como Blob
            const audioBlob = await downloadTelegramFile(fileInfo.file_path);

            // 3. Transcribir el audio a texto usando Groq Whisper
            // Mantenemos una extensión genérica u .ogg, whisper suele detectarlo bien
            const transcribedText = await transcribeAudioGroq(audioBlob, 'audio.ogg');

            logger.info(`Transcripción completada: "${transcribedText.slice(0, 100)}..."`);

            // Avisar al usuario qué fue lo que entendió
            await ctx.api.editMessageText(
                ctx.chat.id,
                tempMessage.message_id,
                `🗣️ *Tú:* "${transcribedText}"`,
                { parse_mode: 'Markdown' }
            );

            // 4. Alimentar el Agent Loop con el texto transcrito
            await ctx.replyWithChatAction('typing');
            const result = await safeRunAgentLoop({ userId, userMessage: transcribedText });

            // 5. Responder con voz ya que el usuario mandó voz
            try {
                logger.info('Generando respuesta de voz...');
                const voiceBlob = await generateSpeechElevenLabs(result.response);
                const arrayBuffer = await voiceBlob.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                await ctx.replyWithVoice(new InputFile(buffer, 'response.mp3'));
                // También enviar el texto por si acaso
                await ctx.reply(result.response, { parse_mode: 'Markdown' });
            } catch (vError) {
                logger.error('Error generando voz de ElevenLabs:', vError);
                await ctx.reply(result.response, { parse_mode: 'Markdown' });
            }

        } catch (error) {
            logger.error(`Error procesando audio del usuario ${userId}:`, error);
            const errMsg = '❌ Error al intentar escuchar tu audio. ';

            if (tempMessage) {
                await ctx.api.editMessageText(ctx.chat.id, tempMessage.message_id, errMsg);
            } else {
                await ctx.reply(errMsg);
            }
        }
    });

    /**
     * Handler para imágenes (Visión Artificial).
     * Groq Vision analiza la imagen y el agent loop responde sobre ella.
     */
    bot.on('message:photo', async (ctx) => {
        const userId = String(ctx.from!.id);
        const photo = ctx.message.photo.pop(); // La versión con más resolución
        const caption = ctx.message.caption || 'Describe esta imagen en detalle y responde a cualquier petición implícita.';

        if (!photo) return;

        logger.info(`Foto recibida de ${userId}. Procesando con Groq Vision...`);

        try {
            await ctx.replyWithChatAction('typing');

            // 1. Obtener ruta del archivo
            const fileInfo = await ctx.api.getFile(photo.file_id);
            if (!fileInfo.file_path) throw new Error('No file_path');

            // 2. Descargar como Base64 Data URL
            const base64Image = await downloadTelegramFileAsBase64(fileInfo.file_path);

            // 3. Ejecutar Agent Loop con formato Multimodal
            const multimodalMessage = [
                { type: 'text', text: caption } as const,
                { type: 'image_url', image_url: { url: base64Image } } as const
            ];

            const result = await safeRunAgentLoop({ userId, userMessage: multimodalMessage });

            try {
                await ctx.reply(result.response, { parse_mode: 'Markdown' });
            } catch {
                await ctx.reply(result.response);
            }

        } catch (error) {
            logger.error(`Error procesando visión para el usuario ${userId}:`, error);
            await ctx.reply('❌ No pude procesar esa imagen. Asegúrate de que no sea muy pesada.');
        }
    });

    /**
     * Cualquier mensaje de texto que no sea un comando se pasa al agent loop.
     */
    bot.on('message:text', async (ctx) => {
        const userId = String(ctx.from!.id);
        const userMessage = ctx.message.text;

        logger.info(`Mensaje de ${userId}: "${userMessage.slice(0, 80)}..."`);

        // Mostrar indicador "escribiendo..." mientras el agente procesa
        await ctx.replyWithChatAction('typing');

        // Ejecutar el agent loop de forma segura
        const result = await safeRunAgentLoop({ userId, userMessage });

        // Enviar la respuesta al usuario con reintentos básicos
        try {
            await ctx.reply(result.response, { parse_mode: 'Markdown' });
        } catch {
            // Si falla con Markdown (caracteres especiales), intentar sin formato
            try {
                await ctx.reply(result.response);
            } catch (innerError) {
                logger.error('No se pudo enviar la respuesta al usuario:', innerError);
                await ctx.reply('❌ Error al enviar la respuesta.');
            }
        }
    });

    // ----- Manejo global de errores de Grammy -----
    bot.catch((err) => {
        const ctx = err.ctx;
        logger.error(`Error en Grammy para update ${ctx.update.update_id}:`);

        if (err.error instanceof GrammyError) {
            logger.error('Error de la API de Telegram:', err.error.message);
        } else if (err.error instanceof HttpError) {
            logger.error('Error de red con Telegram:', err.error.message);
        } else {
            logger.error('Error desconocido:', err.error);
        }
    });

    return bot;
}
