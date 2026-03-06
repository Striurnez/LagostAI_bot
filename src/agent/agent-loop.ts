/**
 * agent/agent-loop.ts
 * Bucle principal del agente (patrón ReAct simplificado).
 * Es completamente agnóstico al canal de comunicación (Telegram, CLI, etc.).
 *
 * Flujo:
 *   [1] Construir contexto (system prompt + historial + memorias)
 *   [2] Llamar al LLM
 *   [3] ¿Hay tool calls? → Ejecutar tool → Añadir resultado → volver a [2]
 *   [3] ¿No hay tool calls? → Retornar respuesta final
 */

import { callLLM, type Message } from './llm.js';
import { buildSystemPrompt, MAX_ITERATIONS_ERROR, AGENT_ERROR_MESSAGE } from './prompt.js';
import { getToolDefinitions, executeTool } from '../tools/registry.js';
import {
    getConversationHistory,
    saveMessage,
    getRecentMemories,
    searchMemories,
} from '../memory/memory-manager.js';
import { logger } from '../utils/logger.js';
import { AgentError } from '../utils/errors.js';
import { env } from '../config/env.js';

// Longitud máxima de mensaje del usuario (seguridad)
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Parámetros de entrada para el agent loop.
 */
export interface AgentInput {
    userId: string;
    userMessage: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

/**
 * Resultado del agent loop.
 */
export interface AgentOutput {
    response: string;
    iterationsUsed: number;
    provider?: 'groq' | 'openrouter';
}

/**
 * Obtiene y formatea las memorias relevantes del usuario para el system prompt.
 */
async function buildMemoryContext(userId: string, userMessage: string | any[]): Promise<string> {
    try {
        // Extraer texto para la búsqueda de memorias si es multimodal
        const textForSearch = typeof userMessage === 'string'
            ? userMessage
            : userMessage.find(m => m.type === 'text')?.text || '';

        // Buscar memorias relacionadas con el mensaje actual
        const relatedMemories = await searchMemories(userId, textForSearch.slice(0, 100));

        // Si no hay relacionadas, traer las más recientes
        const memories = relatedMemories.length > 0
            ? relatedMemories
            : await getRecentMemories(userId, 5);

        if (memories.length === 0) return '';

        return memories
            .map((m) => `- [${m.type}] ${m.content}`)
            .join('\n');
    } catch (error) {
        logger.warn('No se pudieron cargar memorias del usuario', error);
        return '';
    }
}

/**
 * Obtiene el historial de conversación y lo convierte al formato de mensajes del LLM.
 */
async function buildConversationHistory(userId: string): Promise<Message[]> {
    try {
        const history = await getConversationHistory(userId, 20);
        return history.map((msg) => ({
            role: msg.role as Message['role'],
            content: msg.content,
        }));
    } catch (error) {
        logger.warn('No se pudo cargar el historial de conversación', error);
        return [];
    }
}

/**
 * Genera la descripción textual de las herramientas disponibles para el system prompt.
 */
function buildToolDescriptions(): string {
    const definitions = getToolDefinitions();
    if (definitions.length === 0) return 'No hay herramientas disponibles.';

    return definitions
        .map((def) => `- **${def.function.name}**: ${def.function.description}`)
        .join('\n');
}

/**
 * Bucle principal del agente.
 * Ejecuta el patrón ReAct: Reason → Act → Observe hasta producir una respuesta final.
 */
export async function runAgentLoop(input: AgentInput): Promise<AgentOutput> {
    const { userId, userMessage } = input;

    // Seguridad: limitar longitud del mensaje (solo si es string)
    let sanitizedMessage = userMessage;
    let logPreview = '[Mensaje Multimodal con Imagen]';

    if (typeof userMessage === 'string') {
        sanitizedMessage = userMessage.slice(0, MAX_MESSAGE_LENGTH);
        logPreview = `"${sanitizedMessage.slice(0, 100)}..."`;
    }

    logger.info(`Agent loop iniciado para usuario ${userId}`);
    logger.debug(`Mensaje: ${logPreview}`);

    // --- [1] Construir contexto inicial ---

    const toolDescriptions = buildToolDescriptions();
    // extraemos un userMessageString para la memoria a corto plazo
    const userMessageString = typeof sanitizedMessage === 'string' ? sanitizedMessage : (sanitizedMessage.find(item => item.type === 'text')?.text || 'Enviado una imagen.');
    const relevantMemories = await buildMemoryContext(userId, userMessageString);
    const systemPrompt = buildSystemPrompt(toolDescriptions, relevantMemories);
    const historyMessages = await buildConversationHistory(userId);
    const tools = getToolDefinitions();

    // Construir el array de mensajes completo
    const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: sanitizedMessage },
    ];

    let iterations = 0;
    let lastProvider: 'groq' | 'openrouter' | undefined;

    // --- Bucle ReAct ---
    while (iterations < env.AGENT_MAX_ITERATIONS) {
        iterations++;
        logger.debug(`Agent loop — iteración ${iterations}/${env.AGENT_MAX_ITERATIONS}`);

        let llmResponse;
        try {
            // --- [2] Llamar al LLM ---
            llmResponse = await callLLM(messages, tools);
            lastProvider = llmResponse.provider;
        } catch (error) {
            logger.error('Error al llamar al LLM:', error);
            throw new AgentError(
                `Fallo en la llamada al LLM en iteración ${iterations}`,
                error,
            );
        }

        // --- [3] ¿Hay tool calls? ---
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
            // Añadir el mensaje del asistente con las tool calls al contexto
            messages.push({
                role: 'assistant',
                content: llmResponse.content,
                tool_calls: llmResponse.tool_calls,
            });

            // Ejecutar cada tool call y añadir los resultados
            for (const toolCall of llmResponse.tool_calls) {
                let toolResult: string;
                try {
                    // Parsear argumentos del JSON string
                    const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
                    toolResult = await executeTool(toolCall.function.name, args);
                } catch (error) {
                    toolResult = `Error ejecutando herramienta: ${error instanceof Error ? error.message : String(error)}`;
                    logger.error(`Error en tool '${toolCall.function.name}':`, error);
                }

                // Añadir resultado de la tool al contexto
                messages.push({
                    role: 'tool',
                    content: toolResult,
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                });
            }

            // Continuar el bucle para que el LLM procese los resultados
            continue;
        }

        // --- Respuesta final (sin tool calls) ---
        const finalResponse = llmResponse.content ?? '(Sin respuesta del modelo)';

        // Guardar el intercambio en el historial
        try {
            await saveMessage(userId, 'user', userMessageString);
            await saveMessage(userId, 'assistant', finalResponse);
        } catch (error) {
            // No es crítico si falla el guardado — loguear y continuar
            logger.warn('No se pudo guardar el historial de conversación:', error);
        }

        logger.info(
            `Agent loop completado en ${iterations} iteraciones vía ${lastProvider}`,
        );

        return {
            response: finalResponse,
            iterationsUsed: iterations,
            provider: lastProvider,
        };
    }

    // Si llegamos aquí, se agotaron las iteraciones
    logger.warn(
        `Usuario ${userId}: se alcanzó el límite de ${env.AGENT_MAX_ITERATIONS} iteraciones`,
    );

    return {
        response: MAX_ITERATIONS_ERROR,
        iterationsUsed: iterations,
        provider: lastProvider,
    };
}

/**
 * Wrapper seguro del agent loop que nunca lanza excepciones.
 * Retorna un mensaje de error amigable si algo falla.
 */
export async function safeRunAgentLoop(input: AgentInput): Promise<AgentOutput> {
    try {
        return await runAgentLoop(input);
    } catch (error) {
        logger.error('Error no controlado en el agent loop:', error);
        return {
            response: AGENT_ERROR_MESSAGE,
            iterationsUsed: 0,
        };
    }
}
