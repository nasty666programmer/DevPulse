import { DigestIcon, FeedIcon, TelegramIcon } from './icons';
import type { TabId } from '../nav';

export function NavIcon({ id, size = 18 }: { id: TabId; size?: number }) {
  if (id === 'digest') return <DigestIcon size={size} />;
  if (id === 'feed') return <FeedIcon size={size} />;
  return <TelegramIcon size={size} />;
}
