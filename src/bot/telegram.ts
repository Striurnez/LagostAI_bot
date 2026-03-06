/**
 * bot/telegram.ts
 * Configuración de Grammy + handlers de comandos y mensajes.
 * Esta capa solo gestiona la comunicación con Telegram.
 */

import { Bot, GrammyError, HttpError, InputFile } from 'grammy';
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

// Tiempo de inicio para calcular uptime
const startTime = Date.now();

/**
 * Crea y configura la instancia del bot de Grammy.
 */
export function createBot(): Bot {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

    // ----- Middleware global -----
    bot.use(authMiddleware);

    // ----- Comandos -----

    bot.command('start', async (ctx) => {
        const username = ctx.from?.first_name ?? 'usuario';
        await ctx.reply(
            `👋 ¡Hola, ${username}! Soy *LasgostAI*, tu asistente multimodal.\n\n` +
            `• Puedo escucharte (mándame un audio)\n` +
            `• Puedo hablarte (pídeme un audio o mándame voz)\n` +
            `• Puedo ver (mándame una foto)\n\n` +
            `Usa /help para más detalles.`,
            { parse_mode: 'Markdown' },
        );
    });

    bot.command('help', async (ctx) => {
        await ctx.reply(
            `📋 *Comandos disponibles:*\n\n` +
            `• /start — Bienvenida\n` +
            `• /help — Esta ayuda\n` +
            `• /clear — Borrar historial\n` +
            `• /memory — Ver memorias\n` +
            `• /status — Estado del bot\n\n` +
            `_Tips: Si me pides "háblame" o "mándame un audio", te responderé con mi voz de ElevenLabs._`,
            { parse_mode: 'Markdown' },
        );
    });

    bot.command('clear', async (ctx) => {
        const userId = String(ctx.from!.id);
        const deleted = await clearHistory(userId);
        await ctx.reply(`🗑️ Historial borrado (${deleted} mensajes).`);
    });

    bot.command('memory', async (ctx) => {
        const userId = String(ctx.from!.id);
        const memories = await getRecentMemories(userId, 10);
        if (memories.length === 0) {
            await ctx.reply('🧠 No tengo memorias guardadas sobre ti todavía.');
            return;
        }
        const memoryList = memories.map((m, i) => `${i + 1}. [${m.type}] ${m.content}`).join('\n');
        await ctx.reply(`🧠 *Tus memorias:*\n\n${memoryList}`, { parse_mode: 'Markdown' });
    });

    bot.command('status', async (ctx) => {
        const userId = String(ctx.from!.id);
        const uptimeMin = Math.floor((Date.now() - startTime) / 60000);
        const memoryCount = await countMemories(userId);
        await ctx.reply(
            `📊 *Estado*\n` +
            `⏱️ Uptime: ${uptimeMin}m\n` +
            `🧠 Memorias: ${memoryCount}\n` +
            `🤖 Motor: ${env.GROQ_MODEL}`,
            { parse_mode: 'Markdown' },
        );
    });

    // ----- Handlers de Mensajes -----

    /**
     * Función unificada para responder al usuario.
     * Decidimos si enviar audio basándonos en la entrada o palabras clave.
     */
    async function sendSmartResponse(ctx: any, result: { response: string }, forceVoice = false) {
        const text = result.response;
        // Activamos voz si el usuario lo pide o si él mandó un audio primero
        const keywords = /\b(audio|voz|habla|dime|escúchame|leeme|lee|manda audio|háblame)\b/i;
        const shouldVoice = forceVoice || (ctx.message?.text && keywords.test(ctx.message.text));

        if (shouldVoice && env.ELEVENLABS_API_KEY) {
            await ctx.replyWithChatAction('record_voice');
            try {
                const voiceBlob = await generateSpeechElevenLabs(text);
                const buffer = Buffer.from(await voiceBlob.arrayBuffer());
                await ctx.replyWithVoice(new InputFile(buffer, 'respuesta.mp3'));
            } catch (error) {
                logger.error('Error ElevenLabs:', error);
            }
        } else {
            await ctx.replyWithChatAction('typing');
        }

        try {
            await ctx.reply(text, { parse_mode: 'Markdown' });
        } catch {
            await ctx.reply(text);
        }
    }

    /** Handler de Audio (Voz) */
    bot.on(['message:voice', 'message:audio'], async (ctx) => {
        const userId = String(ctx.from!.id);
        const fileObj = ctx.message.voice || ctx.message.audio;
        if (!fileObj) return;

        let temp;
        try {
            temp = await ctx.reply('🎧 _Escuchando..._', { parse_mode: 'Markdown' });
            const fileInfo = await ctx.api.getFile(fileObj.file_id);
            if (!fileInfo.file_path) throw new Error('No file_path');

            const audioBlob = await downloadTelegramFile(fileInfo.file_path);
            const transcription = await transcribeAudioGroq(audioBlob, 'audio.ogg');

            await ctx.api.editMessageText(ctx.chat.id, temp.message_id, `🗣️ *Tú:* "${transcription}"`, { parse_mode: 'Markdown' });

            const result = await safeRunAgentLoop({ userId, userMessage: transcription });
            await sendSmartResponse(ctx, result, true);
        } catch (error) {
            logger.error('Error audio handler:', error);
            if (temp) await ctx.api.editMessageText(ctx.chat.id, temp.message_id, '❌ Fallo al procesar audio.');
        }
    });

    /** Handler de Fotos (Vision) */
    bot.on('message:photo', async (ctx) => {
        const userId = String(ctx.from!.id);
        const photo = ctx.message.photo.pop();
        const caption = ctx.message.caption || 'Describe esta imagen.';
        if (!photo) return;

        try {
            await ctx.replyWithChatAction('typing');
            const fileInfo = await ctx.api.getFile(photo.file_id);
            if (!fileInfo.file_path) throw new Error('No file_path');

            const base64 = await downloadTelegramFileAsBase64(fileInfo.file_path);
            const multimodalMessage = [
                { type: 'text', text: caption } as const,
                { type: 'image_url', image_url: { url: base64 } } as const
            ];

            const result = await safeRunAgentLoop({ userId, userMessage: multimodalMessage });
            await sendSmartResponse(ctx, result);
        } catch (error) {
            logger.error('Error vision handler:', error);
            await ctx.reply('❌ No pude ver esa imagen.');
        }
    });

    /** Handler de Texto */
    bot.on('message:text', async (ctx) => {
        const userId = String(ctx.from!.id);
        const result = await safeRunAgentLoop({ userId, userMessage: ctx.message.text });
        await sendSmartResponse(ctx, result);
    });

    // Error handling
    bot.catch((err) => {
        logger.error(`Error Grammy: ${err.message}`);
    });

    return bot;
}
