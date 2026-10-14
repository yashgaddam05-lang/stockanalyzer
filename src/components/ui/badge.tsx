import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-neutral-900 text-white hover:bg-neutral-800',
        secondary: 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100',
        destructive: 'border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
        outline: 'border-neutral-200 text-neutral-600',
        success: 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100',
        warning: 'border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
        danger: 'border-neutral-400 bg-neutral-200 text-neutral-900 hover:bg-neutral-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
