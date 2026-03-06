/**
 * tools/registry.ts
 * Registro centralizado de herramientas disponibles para el agente.
 * Las tools se registran en tiempo de inicialización, nunca dinámicamente.
 */

import type { Tool, ToolDefinition } from './tool.interface.js';
import { logger } from '../utils/logger.js';
import { ToolError } from '../utils/errors.js';

// Mapa interno de herramientas registradas
const toolRegistry = new Map<string, Tool>();

/**
 * Registra una nueva herramienta en el registry.
 * Lanza un error si ya existe una herramienta con el mismo nombre.
 */
export function registerTool(tool: Tool): void {
    if (toolRegistry.has(tool.name)) {
        throw new ToolError(`Ya existe una herramienta con el nombre '${tool.name}'`, tool.name);
    }
    toolRegistry.set(tool.name, tool);
    logger.debug(`Herramienta registrada: ${tool.name}`);
}

/**
 * Obtiene una herramienta por su nombre.
 * Retorna undefined si no existe.
 */
export function getTool(name: string): Tool | undefined {
    return toolRegistry.get(name);
}

/**
 * Ejecuta una herramienta por nombre con los argumentos dados.
 * Incluye manejo de errores robusto.
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
): Promise<string> {
    const tool = toolRegistry.get(name);

    if (!tool) {
        throw new ToolError(`Herramienta no encontrada: '${name}'`, name);
    }

    logger.info(`Ejecutando herramienta: ${name}`, { args });

    try {
        const result = await tool.execute(args);
        logger.info(`Herramienta completada: ${name}`, { result: result.slice(0, 100) });
        return result;
    } catch (error) {
        throw new ToolError(
            `Error ejecutando herramienta '${name}': ${error instanceof Error ? error.message : String(error)}`,
            name,
            error,
        );
    }
}

/**
 * Genera el array de definiciones de herramientas para enviar al LLM.
 * Compatible con el formato de function calling de OpenAI/Groq.
 */
export function getToolDefinitions(): ToolDefinition[] {
    return Array.from(toolRegistry.values()).map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}

/**
 * Retorna la lista de nombres de todas las herramientas registradas.
 */
export function getRegisteredToolNames(): string[] {
    return Array.from(toolRegistry.keys());
}
