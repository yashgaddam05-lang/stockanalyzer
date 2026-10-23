import { useState } from 'react';
import { Download, PlusSquare, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { promptInstall, useInstallMode } from '@/components/app-install/use-install-mode';

export function InstallAppButton({ className, variant = 'outline', label = 'Install app' }: {
  className?: string;
  variant?: 'outline' | 'ghost';
  label?: string;
}) {
  const mode = useInstallMode();
  const [iosOpen, setIosOpen] = useState(false);
  if (!mode) return null;

  const onClick = async () => {
    if (mode === 'ios') {
      setIosOpen(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <Button type="button" variant={variant} size="sm" className={cn('h-8 gap-1.5 text-[13px]', className)} onClick={() => void onClick()}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </Button>
      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add 3x Hunter to your Home Screen</DialogTitle>
            <DialogDescription>It opens full screen like any other app, with its own icon.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ol className="space-y-3 text-sm text-neutral-800">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[12px] font-semibold text-white">1</span>
                <span>
                  Tap <Share className="mx-0.5 inline h-4 w-4 align-[-3px]" aria-label="Share" /> <b>Share</b> in Safari’s toolbar.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[12px] font-semibold text-white">2</span>
                <span>
                  Scroll down and tap <PlusSquare className="mx-0.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" /> <b>Add to Home Screen</b>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[12px] font-semibold text-white">3</span>
                <span>
                  Tap <b>Add</b>. Sign in once inside the app; it stays signed in.
                </span>
              </li>
            </ol>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button">Got it</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
