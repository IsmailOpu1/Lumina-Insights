import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

/** The signed-in person's profile photo, or their initials on the mint gradient. */
export default function UserAvatar({ className }: { className?: string }) {
  const { user, userSettings } = useAuth();
  const initials = (userSettings?.full_name || userSettings?.business_name || user?.email || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-highlight font-semibold text-primary-foreground', className)}>
      {userSettings?.avatar_url
        ? <img src={userSettings.avatar_url} alt="" className="h-full w-full object-cover" />
        : initials}
    </span>
  );
}
