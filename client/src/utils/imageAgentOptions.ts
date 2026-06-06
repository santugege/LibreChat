import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { Option } from '~/common';

export const IMAGE_AGENT_ID = 'agent_oGoyU0fHfvwXk-b35_VvJ';

export const IMAGE_GENERATION_QUALITY_STORAGE_KEY = 'imageAgent.generation.quality';
export const IMAGE_GENERATION_SIZE_STORAGE_KEY = 'imageAgent.generation.size';

export const IMAGE_GENERATION_QUALITIES = [
  { value: 'auto', label: '自动' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
] as const satisfies readonly Option[];

export const IMAGE_GENERATION_SIZES = [
  { value: 'auto', label: '自动' },
  { value: '1024x1024', label: '1024x1024' },
  { value: '1536x1024', label: '1536x1024' },
  { value: '1024x1536', label: '1024x1536' },
] as const satisfies readonly Option[];

export type ImageGenerationQuality = (typeof IMAGE_GENERATION_QUALITIES)[number]['value'];
export type ImageGenerationSize = (typeof IMAGE_GENERATION_SIZES)[number]['value'];

export type ImageGenerationOptions = {
  quality: ImageGenerationQuality;
  size: ImageGenerationSize;
};

type StorageLike = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem'>>;
type ImageAgentConversation = Pick<TConversation, 'endpoint' | 'endpointType' | 'agent_id'>;

export const DEFAULT_IMAGE_GENERATION_OPTIONS: ImageGenerationOptions = {
  quality: 'auto',
  size: 'auto',
};

function isSupportedValue<T extends string>(
  value: string | null,
  values: readonly { value: T }[],
): value is T {
  return value != null && values.some((option) => option.value === value);
}

function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.localStorage;
}

export function getStoredImageGenerationOptions(
  storage: StorageLike | undefined = getBrowserStorage(),
): ImageGenerationOptions {
  const quality = storage?.getItem(IMAGE_GENERATION_QUALITY_STORAGE_KEY) ?? null;
  const size = storage?.getItem(IMAGE_GENERATION_SIZE_STORAGE_KEY) ?? null;

  return {
    quality: isSupportedValue(quality, IMAGE_GENERATION_QUALITIES)
      ? quality
      : DEFAULT_IMAGE_GENERATION_OPTIONS.quality,
    size: isSupportedValue(size, IMAGE_GENERATION_SIZES)
      ? size
      : DEFAULT_IMAGE_GENERATION_OPTIONS.size,
  };
}

export function storeImageGenerationOptions(
  options: ImageGenerationOptions,
  storage: StorageLike | undefined = getBrowserStorage(),
) {
  storage?.setItem?.(IMAGE_GENERATION_QUALITY_STORAGE_KEY, options.quality);
  storage?.setItem?.(IMAGE_GENERATION_SIZE_STORAGE_KEY, options.size);
}

export function isImageAgentConversation(
  conversation?: Partial<ImageAgentConversation> | null,
): boolean {
  const endpoint = conversation?.endpointType ?? conversation?.endpoint;
  return endpoint === EModelEndpoint.agents && conversation?.agent_id === IMAGE_AGENT_ID;
}

export function buildImageGenerationPayload(
  conversation: Partial<ImageAgentConversation> | null | undefined,
  options: ImageGenerationOptions,
): ImageGenerationOptions | undefined {
  if (!isImageAgentConversation(conversation)) {
    return undefined;
  }
  return options;
}
