"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

type FooterModalKey = "acp" | "evervault" | "about" | null;

const footerLinkClassName =
  "transition-opacity hover:opacity-100 hover:underline underline-offset-4";

export default function Footer() {
  const [activeModal, setActiveModal] = useState<FooterModalKey>(null);

  const closeModal = () => setActiveModal(null);

  return (
    <>
      <footer className="bg-[var(--color-green-dark)] text-[var(--color-cream)] px-6 py-8 mt-auto">
        <div className="max-w-6xl mx-auto text-center text-sm opacity-80">
        <p>&copy; {new Date().getFullYear()} Sunnyvale Onions &amp; Honey</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs opacity-60">
            <button
              type="button"
              onClick={() => setActiveModal("acp")}
              className={footerLinkClassName}
            >
              ACP-ready
            </button>
            <span aria-hidden="true">&middot;</span>
            <button
              type="button"
              onClick={() => setActiveModal("evervault")}
              className={footerLinkClassName}
            >
              Powered by Evervault
            </button>
            <span aria-hidden="true">&middot;</span>
            <button
              type="button"
              onClick={() => setActiveModal("about")}
              className={footerLinkClassName}
            >
              About
            </button>
          </div>
        </div>
      </footer>

      <Modal
        open={activeModal === "acp"}
        title="ACP-ready"
        onClose={closeModal}
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-white/70 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--color-green-dark)]">
              Agent-friendly
            </h3>
            <p className="mt-2">
              AI shopping agents can discover products and buy through ACP. The
              shop speaks both human and machine, with a public manifest and
              checkout session APIs that are designed for automated clients.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={activeModal === "evervault"}
        title="Powered by Evervault"
        onClose={closeModal}
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-white/70 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--color-green-dark)]">
              You own your data
            </h3>
            <p className="mt-2">
              Card data is encrypted with Evervault before it reaches the payment
              routing layer. Sunnyvale keeps control of the tokenized payment
              data instead of handing ownership to a single PSP vault.
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--color-green-dark)]">
              Switch PSPs instantly
            </h3>
            <p className="mt-2">
              ACI or Stripe - update configuration and redeploy. The same
              encrypted card payloads can be routed through either PSP without a
              token migration project.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={activeModal === "about"}
        title="About"
        onClose={closeModal}
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-white/70 p-5 shadow-sm">
            <p>
              Placeholder copy. Add the farm story, sourcing notes, contact
              details, shipping information, or anything else you want visitors
              to see here later.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
