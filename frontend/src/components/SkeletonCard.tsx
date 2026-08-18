export function SkeletonCard() {
  return (
    <div className="card" aria-hidden="true">
      <div className="skel-line skel-meta" />
      <div className="skel-line skel-title-1" />
      <div className="skel-line skel-title-2" />
      <div className="skel-line skel-excerpt" />
      <div className="skel-line skel-excerpt" />
      <div className="skel-line skel-excerpt short" />
    </div>
  );
}
