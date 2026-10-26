export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-8 w-44 rounded-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-24 rounded-3xl" />
        <div className="skeleton h-24 rounded-3xl" />
        <div className="skeleton h-24 rounded-3xl" />
      </div>
      <div className="skeleton h-56 rounded-3xl" />
    </div>
  );
}
