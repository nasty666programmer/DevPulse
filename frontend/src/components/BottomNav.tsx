import { NavIcon } from './NavIcon';
import { NAV_ITEMS } from '../nav';
import type { TabId } from '../nav';

type BottomNavProps = {
  activeTab: TabId;
  onChangeTab: (tab: TabId) => void;
};

export function BottomNav({ activeTab, onChangeTab }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Разделы">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottom-nav-item${activeTab === item.id ? ' is-active' : ''}`}
          aria-current={activeTab === item.id ? 'page' : undefined}
          onClick={() => onChangeTab(item.id)}
        >
          <NavIcon id={item.id} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
