/** Temporary stand-in for a section whose view lands in its own ticket. */
export function SectionPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="font-heading text-lg font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Diese Ansicht wird noch umgesetzt.</p>
    </div>
  );
}
