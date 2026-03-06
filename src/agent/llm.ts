/**
 * agent/llm.ts
 * Abstracción del LLM con Groq como proveedor principal y OpenRouter como fallback.
 * Usa fetch nativo (Node 18+), sin SDKs externos.
 */

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';
import type { ToolDefinition } from '../tools/tool.interface.js';

// =============================================================================
// Tipos
// =============================================================================

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<{
        type: 'text' | 'image_url';
        text?: string;
        image_url?: {
            url: string;
        };
    }> | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface LLMResponse {
    content: string | null;
    tool_calls?: ToolCall[];
    provider: 'groq' | 'openrouter';
    model: string;
}

// =============================================================================
// Llamadas a la API
// =============================================================================

/**
 * Llama a la API de Groq.
 * Retorna null si la respuesta indica rate limit (429) o error de servicio (503).
 */
async function callGroq(
    messages: Message[],
    tools?: ToolDefinition[],
): Promise<LLMResponse | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);

    try {
        // Detectar si hay imágenes para cambiar al modelo de Visión automáticamente
        const hasImages = messages.some(m =>
            Array.isArray(m.content) && m.content.some(c => c.type === 'image_url')
        );

        const model = hasImages ? 'llama-3.2-11b-vision-preview' : env.GROQ_MODEL;

        const body: Record<string, unknown> = {
            model,
            messages,
            temperature: 0.7,
            max_tokens: 4096,
        };

        if (tools && tools.length > 0) {
            body['tools'] = tools;
            body['tool_choice'] = 'auto';
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Rate limit o servicio no disponible → intentar fallback
        if (response.status === 429 || response.status === 503) {
            logger.warn(`Groq devolvió ${response.status}, usando fallback OpenRouter`);
            return null;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new LLMError(
                `Groq API error ${response.status}: ${errorText}`,
                'groq',
                response.status,
            );
        }

        const data = await response.json() as {
            choices: Array<{
                message: {
                    content: string | null;
                    tool_calls?: ToolCall[];
                };
            }>;
            model: string;
        };

        const choice = data.choices[0];
        if (!choice) {
            throw new LLMError('Groq no retornó ninguna opción de respuesta', 'groq');
        }

        return {
            content: choice.message.content,
            tool_calls: choice.message.tool_calls,
            provider: 'groq',
            model: data.model,
        };
    } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof LLMError) throw error;

        // Timeout de fetch
        if (error instanceof Error && error.name === 'AbortError') {
            logger.warn('Groq timeout, intentando con OpenRouter');
            return null;
        }

        throw new LLMError(
            `Error de red con Groq: ${error instanceof Error ? error.message : String(error)}`,
            'groq',
            undefined,
            error,
        );
    }
}

/**
 * Llama a la API de OpenRouter como fallback.
 */
async function callOpenRouter(
    messages: Message[],
    tools?: ToolDefinition[],
): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);

    try {
        const body: Record<string, unknown> = {
            model: env.OPENROUTER_MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 4096,
        };

        if (tools && tools.length > 0) {
            body['tools'] = tools;
            body['tool_choice'] = 'auto';
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/lasgost-ai-bot',
                'X-Title': 'LasgostAI Bot',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new LLMError(
                `OpenRouter API error ${response.status}: ${errorText}`,
                'openrouter',
                response.status,
            );
        }

        const data = await response.json() as {
            choices: Array<{
                message: {
                    content: string | null;
                    tool_calls?: ToolCall[];
                };
            }>;
            model: string;
        };

        const choice = data.choices[0];
        if (!choice) {
            throw new LLMError('OpenRouter no retornó ninguna opción de respuesta', 'openrouter');
        }

        return {
            content: choice.message.content,
            tool_calls: choice.message.tool_calls,
            provider: 'openrouter',
            model: data.model,
        };
    } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof LLMError) throw error;

        if (error instanceof Error && error.name === 'AbortError') {
            throw new LLMError('OpenRouter timeout', 'openrouter', 408, error);
        }

        throw new LLMError(
            `Error de red con OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
            'openrouter',
            undefined,
            error,
        );
    }
}

// =============================================================================
// Función principal
// =============================================================================

/**
 * Llama al LLM con fallback automático.
 * Intenta primero con Groq; si falla por rate limit/timeout, usa OpenRouter.
 */
export async function callLLM(
    messages: Message[],
    tools?: ToolDefinition[],
): Promise<LLMResponse> {
    logger.debug(`Llamando al LLM con ${messages.length} mensajes`);

    // Intentar con Groq primero
    let result = await callGroq(messages, tools);

    if (result) {
        logger.info(`LLM respondió vía Groq (${result.model})`);
        return result;
    }

    // Fallback a OpenRouter
    logger.info('Usando OpenRouter como fallback');
    result = await callOpenRouter(messages, tools);
    logger.info(`LLM respondió vía OpenRouter (${result.model})`);
    return result;
}
