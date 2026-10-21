import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { Logo } from './Logo'
import { NavLinks } from './Sidebar'

export function MobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="left-0 top-0 h-full max-h-none w-72 max-w-72 translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
          <DialogHeader className="h-16 border-b border-border px-5 text-left">
            <DialogTitle className="flex items-center">
              <Logo to="/dashboard" />
            </DialogTitle>
          </DialogHeader>
          <div className="px-3 py-4">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
