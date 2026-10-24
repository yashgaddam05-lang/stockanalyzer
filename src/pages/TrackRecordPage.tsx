import { TrackRecordView } from '@/components/track-record/TrackRecordView';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';

/** 3x Hunter reconstructed since 2016 vs the S&P 500. Rendered both publicly and inside the app. */
export default function TrackRecordPage() {
  useDocumentTitle('Track record since 2016 · 3x Hunter');
  return (
    <div className="space-y-6">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Track record since 2016</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          What would have happened if you had followed the 3x score every quarter since 2016, rebuilt from the data available at
          the time, compared with simply holding the S&P 500.
        </p>
      </div>
      <TrackRecordView />
    </div>
  );
}
