import { logger } from '@librechat/data-schemas';
import { GraphEvents, Constants } from '@librechat/agents';
import type {
  LCTool,
  EventHandler,
  LCToolRegistry,
  ToolCallRequest,
  ToolExecuteResult,
  ToolExecuteBatchRequest,
} from '@librechat/agents';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { runOutsideTracing } from '~/utils';

export interface ToolEndCallbackData {
  output: {
    name: string;
    tool_call_id: string;
    content: string | unknown;
    artifact?: unknown;
  };
}

export interface ToolEndCallbackMetadata {
  run_id?: string;
  thread_id?: string;
  [key: string]: unknown;
}

export type ToolEndCallback = (
  data: ToolEndCallbackData,
  metadata: ToolEndCallbackMetadata,
) => Promise<void>;

type SubscriptionQuotaLimitCandidate = {
  type?: unknown;
  kind?: unknown;
  used?: unknown;
  limit?: unknown;
  planKey?: unknown;
  resetAt?: unknown;
};

export interface ToolExecuteOptions {
  /** Loads tools by name, using agentId to look up agent-specific context */
  loadTools: (
    toolNames: string[],
    agentId?: string,
  ) => Promise<{
    loadedTools: StructuredToolInterface[];
    /** Additional configurable properties to merge (e.g., userMCPAuthMap) */
    configurable?: Record<string, unknown>;
  }>;
  /** Callback to process tool artifacts (code output files, file citations, etc.) */
  toolEndCallback?: ToolEndCallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSubscriptionQuotaLimit(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as SubscriptionQuotaLimitCandidate;
  return (
    candidate.type === 'subscription_quota' &&
    (candidate.kind === 'text' || candidate.kind === 'image') &&
    isFiniteNumber(candidate.used) &&
    isFiniteNumber(candidate.limit) &&
    typeof candidate.planKey === 'string' &&
    typeof candidate.resetAt === 'string'
  );
}

function isSubscriptionQuotaErrorMessage(message: string): boolean {
  try {
    return isSubscriptionQuotaLimit(JSON.parse(message));
  } catch {
    return false;
  }
}

/**
 * Creates the ON_TOOL_EXECUTE handler for event-driven tool execution.
 * This handler receives batched tool calls, loads the required tools,
 * executes them in parallel, and resolves with the results.
 */
export function createToolExecuteHandler(options: ToolExecuteOptions): EventHandler {
  const { loadTools, toolEndCallback } = options;

  return {
    handle: async (_event: string, data: ToolExecuteBatchRequest) => {
      const { toolCalls, agentId, configurable, metadata, resolve, reject } = data;

      try {
        await runOutsideTracing(async () => {
          try {
            const toolNames = [...new Set(toolCalls.map((tc: ToolCallRequest) => tc.name))];
            const { loadedTools, configurable: toolConfigurable } = await loadTools(
              toolNames,
              agentId,
            );
            const toolMap = new Map(loadedTools.map((t) => [t.name, t]));
            const mergedConfigurable = { ...configurable, ...toolConfigurable };

            const results: ToolExecuteResult[] = await Promise.all(
              toolCalls.map(async (tc: ToolCallRequest) => {
                const tool = toolMap.get(tc.name);

                if (!tool) {
                  logger.warn(
                    `[ON_TOOL_EXECUTE] Tool "${tc.name}" not found. Available: ${[...toolMap.keys()].map((k) => `"${k}"`).join(', ')}`,
                  );
                  return {
                    toolCallId: tc.id,
                    status: 'error' as const,
                    content: '',
                    errorMessage: `Tool ${tc.name} not found`,
                  };
                }

                try {
                  const toolCallConfig: Record<string, unknown> = {
                    id: tc.id,
                    stepId: tc.stepId,
                    turn: tc.turn,
                  };

                  if (
                    tc.codeSessionContext &&
                    (tc.name === Constants.EXECUTE_CODE ||
                      tc.name === Constants.PROGRAMMATIC_TOOL_CALLING)
                  ) {
                    toolCallConfig.session_id = tc.codeSessionContext.session_id;
                    if (tc.codeSessionContext.files && tc.codeSessionContext.files.length > 0) {
                      toolCallConfig._injected_files = tc.codeSessionContext.files;
                    }
                  }

                  if (tc.name === Constants.PROGRAMMATIC_TOOL_CALLING) {
                    const toolRegistry = mergedConfigurable?.toolRegistry as
                      | LCToolRegistry
                      | undefined;
                    const ptcToolMap = mergedConfigurable?.ptcToolMap as
                      | Map<string, StructuredToolInterface>
                      | undefined;
                    if (toolRegistry) {
                      const toolDefs: LCTool[] = Array.from(toolRegistry.values()).filter(
                        (t) =>
                          t.name !== Constants.PROGRAMMATIC_TOOL_CALLING &&
                          t.name !== Constants.TOOL_SEARCH,
                      );
                      toolCallConfig.toolDefs = toolDefs;
                      toolCallConfig.toolMap = ptcToolMap ?? toolMap;
                    }
                  }

                  const result = await tool.invoke(tc.args, {
                    toolCall: toolCallConfig,
                    configurable: mergedConfigurable,
                    metadata,
                  } as Record<string, unknown>);

                  if (toolEndCallback) {
                    await toolEndCallback(
                      {
                        output: {
                          name: tc.name,
                          tool_call_id: tc.id,
                          content: result.content,
                          artifact: result.artifact,
                        },
                      },
                      {
                        run_id: (metadata as Record<string, unknown>)?.run_id as string | undefined,
                        thread_id: (metadata as Record<string, unknown>)?.thread_id as
                          | string
                          | undefined,
                        ...metadata,
                      },
                    );
                  }

                  return {
                    toolCallId: tc.id,
                    content: result.content,
                    artifact: result.artifact,
                    status: 'success' as const,
                  };
                } catch (toolError) {
                  const error =
                    toolError instanceof Error ? toolError : new Error(String(toolError));
                  if (isSubscriptionQuotaErrorMessage(error.message)) {
                    logger.warn(`[ON_TOOL_EXECUTE] Tool ${tc.name} blocked by subscription quota`);
                    throw error;
                  }

                  logger.error(`[ON_TOOL_EXECUTE] Tool ${tc.name} error:`, error);
                  return {
                    toolCallId: tc.id,
                    status: 'error' as const,
                    content: '',
                    errorMessage: error.message,
                  };
                }
              }),
            );

            resolve(results);
          } catch (error) {
            const toolError = error instanceof Error ? error : new Error(String(error));
            if (isSubscriptionQuotaErrorMessage(toolError.message)) {
              reject(toolError);
              return;
            }

            logger.error('[ON_TOOL_EXECUTE] Fatal error:', toolError);
            reject(toolError);
          }
        });
      } catch (outerError) {
        const error = outerError instanceof Error ? outerError : new Error(String(outerError));
        if (isSubscriptionQuotaErrorMessage(error.message)) {
          reject(error);
          return;
        }

        logger.error('[ON_TOOL_EXECUTE] Unexpected error:', error);
        reject(error);
      }
    },
  };
}

/**
 * Creates a handlers object that includes ON_TOOL_EXECUTE.
 * Can be merged with other handler objects.
 */
export function createToolExecuteHandlers(
  options: ToolExecuteOptions,
): Record<string, EventHandler> {
  return {
    [GraphEvents.ON_TOOL_EXECUTE]: createToolExecuteHandler(options),
  };
}
