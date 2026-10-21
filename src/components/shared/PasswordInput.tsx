import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input, type InputProps } from '@/ui/input'

/**
 * Password field with a keyboard-accessible show/hide control.
 * The toggle is a real button inside the field, labelled for screen
 * readers and reflecting its state via aria-pressed.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false)

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pr-10', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className={cn(
            'absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors',
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          )}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    )
  },
)
