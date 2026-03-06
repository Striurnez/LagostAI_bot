/**
 * tools/tool.interface.ts
 * Interfaz base que toda herramienta debe implementar.
 * Diseñada para ser compatible con el formato de function calling de OpenAI.
 */

/**
 * Interfaz que define la estructura de una herramienta del agente.
 */
export interface Tool {
    /** Nombre único de la herramienta (sin espacios, en snake_case) */
    name: string;

    /** Descripción que el LLM usará para decidir cuándo invocar esta tool */
    description: string;

    /** Schema JSON de los parámetros que acepta la herramienta */
    parameters: ToolParameters;

    /**
     * Ejecuta la herramienta con los argumentos dados.
     * @param args Argumentos validados según el schema de parameters
     * @returns Resultado como cadena de texto que el agente incluirá en su contexto
     */
    execute(args: Record<string, unknown>): Promise<string>;
}

/**
 * Schema JSON para los parámetros de una herramienta.
 */
export interface ToolParameters {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
}

/**
 * Definición de una propiedad individual de los parámetros.
 */
export interface ToolParameterProperty {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    enum?: string[];
    items?: ToolParameterProperty;
}

/**
 * Formato de definición de herramienta para enviar al LLM.
 * Compatible con el formato de function calling de OpenAI/Groq.
 */
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: ToolParameters;
    };
}
