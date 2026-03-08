"use client";

import { useEffect, useId } from "react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ open, title, onClose, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-[var(--color-cream)] text-[var(--color-green-dark)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-black/10 bg-[var(--color-cream)] px-6 py-5">
          <h2 id={titleId} className="text-2xl font-bold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/10 px-3 py-1 text-sm font-medium hover:bg-black/5"
          >
            Close
          </button>
        </div>
        <div className="px-6 py-6 text-sm leading-6 text-[var(--color-brown)]">
          {children}
        </div>
      </div>
    </div>
  );
}