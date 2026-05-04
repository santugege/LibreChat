import React from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

type UsageMeterProps = {
  label: TranslationKeys;
  used: number;
  limit: number;
};

function UsageMeter({ label, used, limit }: UsageMeterProps) {
  const localize = useLocalize();
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-text-primary">{localize(label)}</span>
        <span className="text-sm font-medium text-text-primary">
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
        <div
          className="h-full rounded-full bg-green-600 transition-[width] dark:bg-green-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default React.memo(UsageMeter);
