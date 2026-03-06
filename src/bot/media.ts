/**
 * bot/media.ts
 * Utilidades para manejar contenido multimedia (imágenes, audios).
 * Interacciona con Telegram API en crudo y con Groq Whisper/Vision.
 */

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Tipos
// =============================================================================

export interface TranscriptionResult {
    text: string;
}

// =============================================================================
// Transcripción de Audio (Groq Whisper)
// =============================================================================

/**
 * Descarga un archivo directamente de los servidores de Telegram.
 * Requiere el file_path devuelto por getFile().
 */
export async function downloadTelegramFile(filePath: string): Promise<Blob> {
    const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    logger.debug(`Descargando archivo de Telegram desde: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error descargando archivo de Telegram: HTTP ${response.status}`);
    }

    return await response.blob();
}

/**
 * Envía un Blob de audio a la API de transcripción de Groq (Whisper).
 */
export async function transcribeAudioGroq(audioBlob: Blob, filename = 'audio.ogg'): Promise<string> {
    logger.info('Enviando audio a Groq Whisper para transcripción...');

    const formData = new FormData();
    // FormData soporta directamente blobs nativos
    formData.append('file', audioBlob, filename);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');
    formData.append('language', 'es'); // Asumimos español u omitimos para auto-detect

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
            // NOTA: NO configures 'Content-Type' manualmente con FormData
            // fetch lo establecerá automáticamente con el boundary multipart correcto
        },
        body: formData,
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error de Groq Whisper HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json() as TranscriptionResult;
    return data.text;
}

// =============================================================================
// Visión Artificial (Imágenes Base64)
// =============================================================================

/**
 * Descarga una imagen de Telegram y la convierte a un Data URL Base64.
 * Formato requerido por Groq Vision: "data:image/jpeg;base64,{base64_string}"
 */
export async function downloadTelegramFileAsBase64(filePath: string): Promise<string> {
    const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    logger.debug(`Descargando imagen de Telegram para Vision: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error descargando imagen de Telegram: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64String = buffer.toString('base64');

    // Asumimos formato JPEG de los servidores de Telegram por simplicidad
    // Groq Vision soporta jpeg, png, webp, gif (no animado).
    return `data:image/jpeg;base64,${base64String}`;
}

// =============================================================================
// Síntesis de Voz (ElevenLabs)
// =============================================================================

/**
 * Convierte texto a audio usando ElevenLabs.
 * Devuelve un Blob de tipo audio/mpeg.
 */
export async function generateSpeechElevenLabs(text: string): Promise<Blob> {
    logger.info('Generando voz con ElevenLabs...');

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'xi-api-key': env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error de ElevenLabs HTTP ${response.status}: ${errText}`);
    }

    return await response.blob();
}
