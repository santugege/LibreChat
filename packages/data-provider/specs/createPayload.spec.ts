import createPayload from '../src/createPayload';
import { EModelEndpoint } from '../src/schemas';
import type { TSubmission } from '../src/types';

describe('createPayload', () => {
  it('carries image generation options into the request payload', () => {
    const submission = {
      userMessage: {
        text: 'generate a poster',
        sender: 'User',
        isCreatedByUser: true,
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        conversationId: 'conversation-id',
        messageId: 'message-id',
        error: false,
      },
      conversation: {
        conversationId: 'conversation-id',
        endpoint: EModelEndpoint.agents,
      },
      endpointOption: {
        endpoint: EModelEndpoint.agents,
        agent_id: 'agent_oGoyU0fHfvwXk-b35_VvJ',
      },
      messages: [],
      isTemporary: false,
      imageGenerationOptions: {
        quality: 'high',
        size: '1024x1536',
      },
    } as TSubmission;

    const { payload } = createPayload(submission);

    expect(payload.imageGenerationOptions).toEqual({
      quality: 'high',
      size: '1024x1536',
    });
  });
});
