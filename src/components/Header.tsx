import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-[var(--color-green-dark)] text-[var(--color-cream)] px-6 py-4">
      <nav className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          <em>Sunnyvale Onions &amp; Honey</em>
        </Link>
        <div className="flex gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-[var(--color-amber)] transition-colors">
            Home
          </Link>
          <Link href="/products" className="hover:text-[var(--color-amber)] transition-colors">
            Shop
          </Link>
          <Link href="/cart" className="hover:text-[var(--color-amber)] transition-colors">
            Cart
          </Link>
        </div>
      </nav>
    </header>
  );
}
