import { CATEGORIES } from '../types';
import type { Category } from '../types';

type CategoryFilterProps = {
  activeCategory: Category | null;
  onChange: (category: Category | null) => void;
};

export function CategoryFilter({ activeCategory, onChange }: CategoryFilterProps) {
  return (
    <div className="category-filter" role="group" aria-label="Фильтр по категориям">
      <button
        type="button"
        className={`category-pill${activeCategory === null ? ' is-active' : ''}`}
        onClick={() => onChange(null)}
      >
        Все
      </button>
      {CATEGORIES.map((category) => (
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
