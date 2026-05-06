import { Constants } from '@librechat/agents';
import type {
  ToolExecuteBatchRequest,
  ToolExecuteResult,
  ToolCallRequest,
} from '@librechat/agents';
import { createToolExecuteHandler, ToolExecuteOptions } from './handlers';

function createMockTool(name: string, capturedConfigs: Record<string, unknown>[]) {
  return {
    name,
    invoke: jest.fn(async (_args: unknown, config: Record<string, unknown>) => {
      capturedConfigs.push({ ...(config.toolCall as Record<string, unknown>) });
      return {
        content: `stdout:\n${name} executed\n`,
        artifact: { session_id: `result-session-${name}`, files: [] },
      };
    }),
  };
}

function createHandler(
  capturedConfigs: Record<string, unknown>[],
  toolNames: string[] = [Constants.EXECUTE_CODE],
) {
  const mockTools = toolNames.map((name) => createMockTool(name, capturedConfigs));
  const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
    loadedTools: mockTools as never[],
  }));
  return createToolExecuteHandler({ loadTools });
}

function invokeHandler(
  handler: ReturnType<typeof createToolExecuteHandler>,
  toolCalls: ToolCallRequest[],
): Promise<ToolExecuteResult[]> {
  return new Promise((resolve, reject) => {
    const request: ToolExecuteBatchRequest = {
      toolCalls,
      resolve,
      reject,
    };
    handler.handle('on_tool_execute', request);
  });
}

describe('createToolExecuteHandler', () => {
  it('rejects subscription quota tool errors so the run surfaces the structured error', async () => {
    const quotaMessage = JSON.stringify({
      type: 'subscription_quota',
      kind: 'image',
      used: 5,
      limit: 5,
      planKey: 'free',
      resetAt: '2026-05-05T16:00:00.000Z',
    });
    const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
      loadedTools: [
        {
          name: 'image_gen_oai',
          invoke: jest.fn(async () => {
            throw new Error(quotaMessage);
          }),
        },
      ] as never[],
    }));
    const handler = createToolExecuteHandler({ loadTools });

    await expect(
      invokeHandler(handler, [
        {
          id: 'call_image_quota',
          name: 'image_gen_oai',
          args: { prompt: 'a tree' },
        },
      ]),
    ).rejects.toThrow(quotaMessage);
  });

  describe('code execution session context passthrough', () => {
    it('passes session_id and _injected_files from codeSessionContext to toolCallConfig', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_1',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'print("hi")' },
          codeSessionContext: {
            session_id: 'prev-session-abc',
            files: [
              { session_id: 'prev-session-abc', id: 'f1', name: 'data.parquet' },
              { session_id: 'prev-session-abc', id: 'f2', name: 'chart.png' },
            ],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBe('prev-session-abc');
      expect(capturedConfigs[0]._injected_files).toEqual([
        { session_id: 'prev-session-abc', id: 'f1', name: 'data.parquet' },
        { session_id: 'prev-session-abc', id: 'f2', name: 'chart.png' },
      ]);
    });

    it('passes session_id without _injected_files when session has no files', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_2',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'import pandas' },
          codeSessionContext: {
            session_id: 'session-no-files',
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBe('session-no-files');
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });

    it('does not inject session context when codeSessionContext is absent', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_3',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'x = 1' },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBeUndefined();
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });

    it('passes session context independently for multiple code execution calls', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_a',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'step_1()' },
          codeSessionContext: {
            session_id: 'session-A',
            files: [{ session_id: 'session-A', id: 'fa', name: 'a.csv' }],
          },
        },
        {
          id: 'call_b',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'step_2()' },
          codeSessionContext: {
            session_id: 'session-A',
            files: [{ session_id: 'session-A', id: 'fa', name: 'a.csv' }],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(2);
      for (const config of capturedConfigs) {
        expect(config.session_id).toBe('session-A');
        expect(config._injected_files).toEqual([
          { session_id: 'session-A', id: 'fa', name: 'a.csv' },
        ]);
      }
    });

    it('does not pass session context to non-code-execution tools', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs, ['web_search']);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_ws',
          name: 'web_search',
          args: { query: 'test' },
          codeSessionContext: {
            session_id: 'should-be-ignored',
            files: [{ session_id: 'x', id: 'y', name: 'z' }],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBeUndefined();
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });
  });
});
