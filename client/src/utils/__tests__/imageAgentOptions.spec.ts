import { EModelEndpoint } from 'librechat-data-provider';
import {
  DEFAULT_IMAGE_GENERATION_OPTIONS,
  IMAGE_AGENT_ID,
  IMAGE_GENERATION_QUALITIES,
  IMAGE_GENERATION_SIZES,
  buildImageGenerationPayload,
  getStoredImageGenerationOptions,
  isImageAgentConversation,
} from '../imageAgentOptions';

describe('imageAgentOptions', () => {
  describe('isImageAgentConversation', () => {
    it('returns true only for the configured image agent on the agents endpoint', () => {
      expect(
        isImageAgentConversation({
          endpoint: EModelEndpoint.agents,
          agent_id: IMAGE_AGENT_ID,
        }),
      ).toBe(true);

      expect(
        isImageAgentConversation({
          endpointType: EModelEndpoint.agents,
          agent_id: IMAGE_AGENT_ID,
        }),
      ).toBe(true);

      expect(
        isImageAgentConversation({
          endpoint: EModelEndpoint.agents,
          agent_id: 'agent_other',
        }),
      ).toBe(false);

      expect(
        isImageAgentConversation({
          endpoint: EModelEndpoint.openAI,
          agent_id: IMAGE_AGENT_ID,
        }),
      ).toBe(false);

      expect(isImageAgentConversation(null)).toBe(false);
    });
  });

  describe('supported options', () => {
    it('exposes every image2 quality and generation size supported by the image tool', () => {
      expect(IMAGE_GENERATION_QUALITIES.map((option) => option.value)).toEqual([
        'auto',
        'high',
        'medium',
        'low',
      ]);
      expect(IMAGE_GENERATION_SIZES.map((option) => option.value)).toEqual([
        'auto',
        '1024x1024',
        '1536x1024',
        '1024x1536',
      ]);
    });
  });

  describe('getStoredImageGenerationOptions', () => {
    it('falls back to auto when stored values are not supported', () => {
      const storage = {
        getItem: (key: string) => {
          if (key.includes('quality')) {
            return 'ultra';
          }
          if (key.includes('size')) {
            return '2048x2048';
          }
          return null;
        },
      };

      expect(getStoredImageGenerationOptions(storage)).toEqual(DEFAULT_IMAGE_GENERATION_OPTIONS);
    });
  });

  describe('buildImageGenerationPayload', () => {
    it('builds a structured payload for the configured image agent', () => {
      expect(
        buildImageGenerationPayload(
          {
            endpoint: EModelEndpoint.agents,
            agent_id: IMAGE_AGENT_ID,
          },
          {
            quality: 'high',
            size: '1536x1024',
          },
        ),
      ).toEqual({
        quality: 'high',
        size: '1536x1024',
      });
    });

    it('returns undefined for non-image-agent conversations', () => {
      expect(
        buildImageGenerationPayload(
          {
            endpoint: EModelEndpoint.openAI,
            agent_id: IMAGE_AGENT_ID,
          },
          {
            quality: 'high',
            size: '1536x1024',
          },
        ),
      ).toBeUndefined();
    });
  });
});
