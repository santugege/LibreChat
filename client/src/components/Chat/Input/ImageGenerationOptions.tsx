import { memo, useCallback } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useRecoilState } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import {
  IMAGE_GENERATION_QUALITIES,
  IMAGE_GENERATION_SIZES,
  isImageAgentConversation,
  storeImageGenerationOptions,
  type ImageGenerationQuality,
  type ImageGenerationSize,
  type ImageGenerationOptions as ImageGenerationSettings,
} from '~/utils/imageAgentOptions';
import { cn } from '~/utils';
import store from '~/store';

function ImageOptionSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border-light bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
    >
      <span className="whitespace-nowrap">{label}</span>
      <select
        id={id}
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'max-w-[8.5rem] cursor-pointer bg-transparent text-xs font-medium text-text-primary outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label ?? option.value}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImageGenerationOptions({ conversation }: { conversation: TConversation | null }) {
  const [options, setOptions] = useRecoilState(store.imageGenerationOptions);

  const updateOptions = useCallback(
    (nextOptions: ImageGenerationSettings) => {
      setOptions(nextOptions);
      storeImageGenerationOptions(nextOptions);
    },
    [setOptions],
  );

  const updateQuality = useCallback(
    (quality: string) => {
      updateOptions({ ...options, quality: quality as ImageGenerationQuality });
    },
    [options, updateOptions],
  );

  const updateSize = useCallback(
    (size: string) => {
      updateOptions({ ...options, size: size as ImageGenerationSize });
    },
    [options, updateOptions],
  );

  if (!isImageAgentConversation(conversation)) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-2 pt-2"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-secondary text-text-secondary">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <ImageOptionSelect
        id="image-generation-quality"
        label="质量"
        value={options.quality}
        options={IMAGE_GENERATION_QUALITIES}
        onChange={updateQuality}
      />
      <ImageOptionSelect
        id="image-generation-size"
        label="尺寸"
        value={options.size}
        options={IMAGE_GENERATION_SIZES}
        onChange={updateSize}
      />
    </div>
  );
}

export default memo(ImageGenerationOptions);
