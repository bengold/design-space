import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';

import { cn } from '@/lib/utils';
import { toggleVariants } from '@/components/ui/toggle-variants';

function Toggle({ className, variant = 'default', size = 'default', ...props }) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle };
