import { PositionDialog } from '@/components/portfolio/PositionDialog';

/**
 * Adds a simulated position. Lets the user choose a portfolio and creates 'My Portfolio'
 * automatically when they have none. Validates shares > 0, cost >= 0 and a non-future date.
 */
export function AddPositionDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultTicker?: string;
  defaultCostBasis?: number | null;
  onAdded?: () => void;
}) {
  const { open, onOpenChange, defaultTicker, defaultCostBasis, onAdded } = props;
  return (
    <PositionDialog
      mode="add"
      open={open}
      onOpenChange={onOpenChange}
      defaultTicker={defaultTicker}
      defaultCostBasis={defaultCostBasis}
      onSaved={onAdded ? () => onAdded() : undefined}
    />
  );
}
