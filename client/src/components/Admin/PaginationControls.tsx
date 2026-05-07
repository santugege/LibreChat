import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocalize } from '~/hooks';

type PaginationControlsProps = {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
};

function PaginationControls({ total, limit, offset, onOffsetChange }: PaginationControlsProps) {
  const localize = useLocalize();
  const canPrevious = offset > 0;
  const nextOffset = offset + limit;
  const canNext = nextOffset < total;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <div className="flex min-h-10 items-center justify-between gap-3 text-sm text-text-secondary">
      <span>
        {localize('com_admin_pagination_range', {
          start,
          end,
          total,
        })}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={localize('com_admin_pagination_previous')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-light hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canPrevious}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={localize('com_admin_pagination_next')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-light hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canNext}
          onClick={() => onOffsetChange(nextOffset)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default React.memo(PaginationControls);
