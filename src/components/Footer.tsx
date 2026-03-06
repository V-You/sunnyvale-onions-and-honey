export default function Footer() {
  return (
    <footer className="bg-[var(--color-green-dark)] text-[var(--color-cream)] px-6 py-8 mt-auto">
      <div className="max-w-6xl mx-auto text-center text-sm opacity-80">
        <p>&copy; {new Date().getFullYear()} Sunnyvale Onions &amp; Honey</p>
        <p className="mt-1">
          Root access to your produce &middot; Bot-to-table fresh &middot; Ag-entic commerce
        </p>
        <p className="mt-2 text-xs opacity-60">
          ACP-ready &middot; Powered by Evervault
        </p>
      </div>
    </footer>
  );
}
