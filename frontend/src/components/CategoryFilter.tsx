import type { Category } from '../types';

type CategoryFilterProps = {
  categories: Category[];
  activeCategory: Category | null;
  onChange: (category: Category | null) => void;
};

export function CategoryFilter({ categories, activeCategory, onChange }: CategoryFilterProps) {
  // Nothing to filter by yet (new user, no collected items) — an "Все" pill
  // alone with nothing behind it would just be clutter.
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="category-filter" role="group" aria-label="Фильтр по категориям">
      <button
        type="button"
        className={`category-pill${activeCategory === null ? ' is-active' : ''}`}
        onClick={() => onChange(null)}
      >
        Все
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className={`category-pill${activeCategory === category ? ' is-active' : ''}`}
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
