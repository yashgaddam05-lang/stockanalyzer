export interface TocItem {
  id: string;
  label: string;
}

export function MethodologyToc({ items, activeId }: { items: TocItem[]; activeId?: string }) {
  return (
    <nav aria-label="On this page" className="sticky top-24">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-neutral-500">On this page</p>
      <ul className="space-y-1 border-l border-border">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                className={
                  '-ml-px block border-l py-1 pl-3 text-[13px] transition-colors ' +
                  (active
                    ? 'border-neutral-900 font-medium text-neutral-900'
                    : 'border-transparent text-muted-foreground hover:text-neutral-900')
                }
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
