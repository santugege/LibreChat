const express = require('express');
const request = require('supertest');

const mockModels = {
  getRoleByName: jest.fn(),
  getEnabledSubscriptionPlans: jest.fn(),
  findActiveUserSubscription: jest.fn(),
  consumeSubscriptionQuota: jest.fn(),
};
const mockObservedQuota = [];
const mockQuotaMiddleware = jest.fn((req, _res, next) => {
  req.subscriptionQuotaChecked = true;
  next();
});
const mockQuotaIdempotencyMiddleware = jest.fn((req, _res, next) => {
  req.subscriptionQuotaIdempotencyChecked = true;
  next();
});
const mockCreateTextQuotaMiddleware = jest.fn(() => mockQuotaMiddleware);
const mockCreateTextQuotaIdempotencyMiddleware = jest.fn(() => mockQuotaIdempotencyMiddleware);
const mockPass = (_req, _res, next) => next();
const mockGenerateCheckAccess = jest.fn(() => mockPass);
const mockCanAccessAgentFromBody = jest.fn(() => mockPass);
const mockCreateRequireApiKeyAuth = jest.fn(() => mockPass);
const mockCreateCheckRemoteAgentAccess = jest.fn(() => mockPass);
const mockValidateRequest = jest.fn(() => ({
  valid: true,
  request: { model: 'agent-1', messages: [{ role: 'user', content: 'hello' }] },
}));
const mockIsChatCompletionValidationFailure = jest.fn((validation) => validation.valid === false);
const mockCreateErrorResponse = jest.fn(
  (message, type = 'invalid_request_error', code = null) => ({
    error: {
      message,
      type,
      param: null,
      code,
    },
  }),
);
const mockValidateResponseRequest = jest.fn(() => ({
  valid: true,
  request: { model: 'agent-1', input: 'hello' },
}));
const mockIsValidationFailure = jest.fn((validation) => validation.valid === false);
const mockSendResponsesErrorResponse = jest.fn(
  (res, statusCode, message, type = 'invalid_request', code) => {
    res.status(statusCode).json({
      error: {
        type,
        message,
        code: code ?? null,
        param: null,
      },
    });
  },
);
const mockAgentController = jest.fn((req, res) => {
  mockObservedQuota.push(req.subscriptionQuotaChecked === true);
  res.status(204).end();
});
const mockAssistantV1Controller = jest.fn((req, res) => {
  mockObservedQuota.push(req.subscriptionQuotaChecked === true);
  res.status(204).end();
});
const mockAssistantV2Controller = jest.fn((req, res) => {
  mockObservedQuota.push(req.subscriptionQuotaChecked === true);
  res.status(204).end();
});
const mockOpenAIChatCompletionController = jest.fn((req, res) => {
  mockObservedQuota.push(req.subscriptionQuotaChecked === true);
  res.status(204).end();
});
const mockOpenAIListModelsController = jest.fn((_req, res) => {
  res.status(204).end();
});
const mockOpenAIGetModelController = jest.fn((_req, res) => {
  res.status(204).end();
});
const mockResponsesCreateResponse = jest.fn((req, res) => {
  mockObservedQuota.push(req.subscriptionQuotaChecked === true);
  res.status(204).end();
});
const mockResponsesGetResponse = jest.fn((_req, res) => {
  res.status(204).end();
});
const mockResponsesListModels = jest.fn((_req, res) => {
  res.status(204).end();
});

jest.mock('@librechat/api', () => ({
  createTextQuotaMiddleware: mockCreateTextQuotaMiddleware,
  createTextQuotaIdempotencyMiddleware: mockCreateTextQuotaIdempotencyMiddleware,
  generateCheckAccess: mockGenerateCheckAccess,
  createRequireApiKeyAuth: mockCreateRequireApiKeyAuth,
  createCheckRemoteAgentAccess: mockCreateCheckRemoteAgentAccess,
  validateRequest: mockValidateRequest,
  isChatCompletionValidationFailure: mockIsChatCompletionValidationFailure,
  createErrorResponse: mockCreateErrorResponse,
  validateResponseRequest: mockValidateResponseRequest,
  isValidationFailure: mockIsValidationFailure,
  sendResponsesErrorResponse: mockSendResponsesErrorResponse,
  skipAgentCheck: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  PermissionTypes: { AGENTS: 'agents', REMOTE_AGENTS: 'remote_agents' },
  Permissions: { USE: 'use' },
  PermissionBits: { VIEW: 1 },
}));

jest.mock('~/models', () => mockModels);

jest.mock('~/server/middleware', () => ({
  moderateText: mockPass,
  validateConvoAccess: mockPass,
  buildEndpointOption: mockPass,
  configMiddleware: mockPass,
  canAccessAgentFromBody: mockCanAccessAgentFromBody,
  setHeaders: mockPass,
  handleAbort: () => mockPass,
  validateModel: mockPass,
}));

jest.mock('~/server/middleware/validate/convoAccess', () => mockPass);
jest.mock('~/server/middleware/assistants/validate', () => mockPass);
jest.mock('~/server/services/Endpoints/agents', () => ({ initializeClient: jest.fn() }));
jest.mock('~/server/controllers/agents/request', () => mockAgentController);
jest.mock('~/server/services/Endpoints/agents/title', () => jest.fn());
jest.mock('~/server/controllers/assistants/chatV1', () => mockAssistantV1Controller);
jest.mock('~/server/controllers/assistants/chatV2', () => mockAssistantV2Controller);
jest.mock('~/server/controllers/agents/openai', () => ({
  OpenAIChatCompletionController: mockOpenAIChatCompletionController,
  ListModelsController: mockOpenAIListModelsController,
  GetModelController: mockOpenAIGetModelController,
}));
jest.mock('~/server/controllers/agents/responses', () => ({
  createResponse: mockResponsesCreateResponse,
  getResponse: mockResponsesGetResponse,
  listModels: mockResponsesListModels,
}));
jest.mock('~/server/services/PermissionService', () => ({
  getEffectivePermissions: jest.fn(),
}));

function createApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  return app;
}

function loadRoute(path) {
  jest.resetModules();
  mockObservedQuota.length = 0;
  mockCreateTextQuotaMiddleware.mockClear();
  mockCreateTextQuotaIdempotencyMiddleware.mockClear();
  mockQuotaMiddleware.mockClear();
  mockQuotaIdempotencyMiddleware.mockClear();
  mockAgentController.mockClear();
  mockAssistantV1Controller.mockClear();
  mockAssistantV2Controller.mockClear();
  mockOpenAIChatCompletionController.mockClear();
  mockOpenAIListModelsController.mockClear();
  mockOpenAIGetModelController.mockClear();
  mockResponsesCreateResponse.mockClear();
  mockResponsesGetResponse.mockClear();
  mockResponsesListModels.mockClear();
  mockCreateCheckRemoteAgentAccess.mockClear();
  mockValidateRequest.mockClear();
  mockValidateRequest.mockReturnValue({
    valid: true,
    request: { model: 'agent-1', messages: [{ role: 'user', content: 'hello' }] },
  });
  mockIsChatCompletionValidationFailure.mockClear();
  mockIsChatCompletionValidationFailure.mockImplementation(
    (validation) => validation.valid === false,
  );
  mockCreateErrorResponse.mockClear();
  mockValidateResponseRequest.mockClear();
  mockValidateResponseRequest.mockReturnValue({
    valid: true,
    request: { model: 'agent-1', input: 'hello' },
  });
  mockIsValidationFailure.mockClear();
  mockIsValidationFailure.mockImplementation((validation) => validation.valid === false);
  mockSendResponsesErrorResponse.mockClear();
  return require(path);
}

describe('subscription quota chat route wiring', () => {
  test('checks text quota before agent chat controller', async () => {
    const router = loadRoute('~/server/routes/agents/chat');
    const app = createApp(router);

    const response = await request(app).post('/').send({ messageId: 'message-1' });

    expect(response.status).toBe(204);
    expect(mockCreateTextQuotaIdempotencyMiddleware).toHaveBeenCalledWith();
    expect(mockQuotaIdempotencyMiddleware).toHaveBeenCalledTimes(1);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels);
    expect(mockQuotaMiddleware).toHaveBeenCalledTimes(1);
    expect(mockObservedQuota).toEqual([true]);
  });

  test('does not check text quota for non-chat agent methods', async () => {
    const router = loadRoute('~/server/routes/agents/chat');
    const app = createApp(router);

    const response = await request(app).get('/not-found');

    expect(response.status).toBe(404);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels);
    expect(mockQuotaMiddleware).not.toHaveBeenCalled();
  });

  test('checks text quota before assistant v1 chat controller', async () => {
    const router = loadRoute('~/server/routes/assistants/chatV1');
    const app = createApp(router);

    const response = await request(app).post('/').send({ messageId: 'message-1' });

    expect(response.status).toBe(204);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels);
    expect(mockQuotaMiddleware).toHaveBeenCalledTimes(1);
    expect(mockObservedQuota).toEqual([true]);
  });

  test('checks text quota before assistant v2 chat controller', async () => {
    const router = loadRoute('~/server/routes/assistants/chatV2');
    const app = createApp(router);

    const response = await request(app).post('/').send({ messageId: 'message-1' });

    expect(response.status).toBe(204);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels);
    expect(mockQuotaMiddleware).toHaveBeenCalledTimes(1);
    expect(mockObservedQuota).toEqual([true]);
  });

  test('checks text quota before OpenAI-compatible remote agent chat controller', async () => {
    const router = loadRoute('~/server/routes/agents/openai');
    const app = createApp(router);

    const response = await request(app)
      .post('/chat/completions')
      .send({ model: 'agent-1', messages: [{ role: 'user', content: 'hello' }] });

    expect(response.status).toBe(204);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels, {
      errorFormat: 'openai',
      requestIdPolicy: 'generated',
    });
    expect(mockQuotaMiddleware).toHaveBeenCalledTimes(1);
    expect(mockObservedQuota).toEqual([true]);
  });

  test('does not check text quota for invalid OpenAI-compatible remote agent requests', async () => {
    mockValidateRequest.mockReturnValueOnce({
      valid: false,
      error: 'messages array is required',
    });
    const router = loadRoute('~/server/routes/agents/openai');
    const app = createApp(router);

    const response = await request(app).post('/chat/completions').send({ model: 'agent-1' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        message: 'messages array is required',
        type: 'invalid_request_error',
        param: null,
        code: null,
      },
    });
    expect(mockQuotaMiddleware).not.toHaveBeenCalled();
    expect(mockOpenAIChatCompletionController).not.toHaveBeenCalled();
  });

  test('does not check text quota for OpenAI-compatible remote agent model listing', async () => {
    const router = loadRoute('~/server/routes/agents/openai');
    const app = createApp(router);

    const response = await request(app).get('/models');

    expect(response.status).toBe(204);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels, {
      errorFormat: 'openai',
      requestIdPolicy: 'generated',
    });
    expect(mockQuotaMiddleware).not.toHaveBeenCalled();
  });

  test('does not check text quota when remote agent permission denies the request', async () => {
    mockCreateCheckRemoteAgentAccess.mockReturnValueOnce((_req, res) => {
      res.status(403).end();
    });
    const router = loadRoute('~/server/routes/agents/openai');
    const app = createApp(router);

    const response = await request(app)
      .post('/chat/completions')
      .send({ model: 'agent-1', messages: [{ role: 'user', content: 'hello' }] });

    expect(response.status).toBe(403);
    expect(mockQuotaMiddleware).not.toHaveBeenCalled();
  });

  test('checks text quota before Open Responses remote agent controller', async () => {
    const router = loadRoute('~/server/routes/agents/responses');
    const app = createApp(router);

    const response = await request(app).post('/').send({ model: 'agent-1', input: 'hello' });

    expect(response.status).toBe(204);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels, {
      errorFormat: 'responses',
      requestIdPolicy: 'generated',
    });
    expect(mockQuotaMiddleware).toHaveBeenCalledTimes(1);
    expect(mockObservedQuota).toEqual([true]);
  });

  test('does not check text quota for invalid Open Responses remote agent requests', async () => {
    mockValidateResponseRequest.mockReturnValueOnce({
      valid: false,
      error: 'input is required',
    });
    const router = loadRoute('~/server/routes/agents/responses');
    const app = createApp(router);

    const response = await request(app).post('/').send({ model: 'agent-1' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        type: 'invalid_request',
        message: 'input is required',
        code: null,
        param: null,
      },
    });
    expect(mockQuotaMiddleware).not.toHaveBeenCalled();
    expect(mockResponsesCreateResponse).not.toHaveBeenCalled();
  });

  test('does not check text quota for Open Responses remote agent reads', async () => {
    const router = loadRoute('~/server/routes/agents/responses');
    const app = createApp(router);

    const response = await request(app).get('/models');

    expect(response.status).toBe(204);
    expect(mockCreateTextQuotaMiddleware).toHaveBeenCalledWith(mockModels, {
      errorFormat: 'responses',
      requestIdPolicy: 'generated',
    });
    expect(mockQuotaMiddleware).not.toHaveBeenCalled();
  });
});
