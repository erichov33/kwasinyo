export function ButtonGrid<T extends { id: number; name: string }>({
  items,
  selectedId,
  onSelect,
}: {
  items: T[]
  selectedId: number | null
  onSelect: (item: T) => void
}) {
  return (
    <div className="grid">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={it.id === selectedId ? 'gridbtn gridbtn--active' : 'gridbtn'}
          onClick={() => onSelect(it)}
        >
          {it.name}
        </button>
      ))}
    </div>
  )
}

