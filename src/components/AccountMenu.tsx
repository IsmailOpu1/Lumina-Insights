import { useNavigate } from 'react-router-dom';
import { CreditCard, LogOut, Settings, UserRound } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { planLabel } from '@/lib/subscription';
import UserAvatar from './UserAvatar';

/** Avatar in the top bar; opens the signed-in person's account menu. */
export default function AccountMenu() {
  const navigate = useNavigate();
  const { user, userSettings, isOwner, isManager, isViewer, signOut } = useAuth();
  const { subscription } = useSubscription();
  const role = isOwner ? 'Owner' : isManager ? 'Manager' : isViewer ? 'Viewer' : null;
  const name = userSettings?.full_name || user?.email?.split('@')[0] || 'Account';

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 outline-none transition-colors hover:bg-secondary data-[state=open]:bg-secondary"
        aria-label="Open account menu"
      >
        <UserAvatar className="h-7 w-7 text-[11px]" />
        {role && <span className="hidden text-xs text-muted-foreground sm:inline">{role}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 p-2 font-normal">
          <UserAvatar className="h-10 w-10 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            <p className="mt-1 flex gap-1.5 text-[11px]">
              {role && <span className="rounded border border-border px-1.5 py-px text-muted-foreground">{role}</span>}
              {subscription && <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-px text-primary">{planLabel(subscription)}</span>}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings#profile')} className="gap-2.5 py-2">
          <UserRound size={16} className="text-muted-foreground" /> My account
        </DropdownMenuItem>
        {!isViewer && (
          <DropdownMenuItem onSelect={() => navigate('/settings')} className="gap-2.5 py-2">
            <Settings size={16} className="text-muted-foreground" /> Settings
          </DropdownMenuItem>
        )}
        {isOwner && (
          <DropdownMenuItem onSelect={() => navigate('/billing')} className="gap-2.5 py-2">
            <CreditCard size={16} className="text-muted-foreground" /> Billing
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="gap-2.5 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive">
          <LogOut size={16} /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
