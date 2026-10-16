import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddPositionDialog } from '@/components/portfolio/AddPositionDialog';

/** Opens the add-position dialog for `ticker`, prefilled with the current price as cost basis. */
export function AddPositionButton(props: { ticker: string; currentPrice?: number | null }) {
  const { ticker, currentPrice } = props;
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Add ${ticker.toUpperCase()} to a simulated portfolio`}
      >
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        Add to portfolio
      </Button>
      {added && (
        <Link
          to="/app/portfolios"
          className="inline-flex items-center gap-1 text-xs text-emerald-700 underline-offset-2 hover:underline"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Added. View portfolio
        </Link>
      )}
      <AddPositionDialog
        open={open}
        onOpenChange={setOpen}
        defaultTicker={ticker}
        defaultCostBasis={currentPrice ?? null}
        onAdded={() => setAdded(true)}
      />
    </div>
  );
}
