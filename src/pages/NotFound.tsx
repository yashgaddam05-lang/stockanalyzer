import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <Card className="p-12 text-center border-border">
      <p className="text-sm font-medium text-neutral-900">Page not found</p>
      <Link to="/" className="text-[13px] text-muted-foreground underline underline-offset-2 mt-2 inline-block">Back to Dashboard</Link>
    </Card>
  );
}
