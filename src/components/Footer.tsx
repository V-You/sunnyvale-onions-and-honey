"use client";

import { Fragment, useState, type ReactNode } from "react";
import Modal from "@/components/Modal";

type FooterModalKey = "acp" | "evervault" | "about";

interface FooterModalSection {
  heading?: string;
  body: ReactNode;
}

interface FooterModalEntry {
  key: FooterModalKey;
  label: string;
  title: string;
  sections: FooterModalSection[];
}

const footerEntries: FooterModalEntry[] = [
  {
    key: "acp",
    label: "ACP-ready",
    title: "ACP-ready",
    sections: [
      {
        heading: "Agent-friendly",
        body:
          "AI shopping agents can discover products and buy through ACP. The shop speaks both human and machine, with a public manifest and checkout session APIs that are designed for automated clients.",
      },
    ],
  },
  {
    key: "evervault",
    label: "Powered by Evervault",
    title: "Powered by Evervault",
    sections: [
      {
        heading: "You own your data",
        body:
          "Card data is encrypted with Evervault before it reaches the payment routing layer. Sunnyvale keeps control of the tokenized payment data instead of handing ownership to a single PSP vault.",
      },
      {
        heading: "Switch PSPs instantly",
        body:
          "ACI or Stripe - update configuration and redeploy. The same encrypted card payloads can be routed through either PSP without a token migration project.",
      },
    ],
  },
  {
    key: "about",
    label: "About",
    title: "About",
    sections: [
      {
        body:
          (
            <>
              <p>This demo shows that a merchant can:</p>
              <ul>
                <li><strong>Own 100% of their tokenized card data</strong>  &nbsp;  Not locked into any payment provider's vault</li>
                <li><strong>Stay PCI-compliant (SAQ A)</strong>  &nbsp;  Without ever handling plaintext PANs</li>
                <li><strong>Hot-swap payment processors with a config change</strong>  &nbsp;  Switch PSPs via env var and redeploy</li>
                <li><strong>Serve AI shopping agents</strong>  &nbsp;  Via the Agentic Commerce Protocol (ACP), alongside human shoppers</li>
                <li><strong>Stay processor-agnostic for agentic payments</strong>  &nbsp;  Not locked into whichever PSP the agent prefers</li>
              </ul>
              <p>The demo shop uses <a href="https://github.com/V-You/evervault-architect-mcp">Evervault Architect MCP</a>, a server that automates Relay setup and integration, and puts docs-as-action at your fingertips.
              </p>
            </>
          ),
      },
    ],
  },
];

const footerLinkClassName =
  "transition-opacity hover:opacity-100 hover:underline underline-offset-4";

export default function Footer() {
  const [activeModal, setActiveModal] = useState<FooterModalKey | null>(null);
  const activeEntry = footerEntries.find((entry) => entry.key === activeModal) ?? null;

  const closeModal = () => setActiveModal(null);

  return (
    <>
      <footer className="bg-[var( &nbsp; color-green-dark)] text-[var( &nbsp; color-cream)] px-6 py-8 mt-auto">
        <div className="max-w-6xl mx-auto text-center text-sm opacity-80">
          <p>&copy; {new Date().getFullYear()} Sunnyvale Onions &amp; Honey</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs opacity-60">
            {footerEntries.map((entry, entryIndex) => (
              <Fragment key={entry.key}>
                {entryIndex > 0 && <span aria-hidden="true">&middot;</span>}
                <button
                  type="button"
                  onClick={() => setActiveModal(entry.key)}
                  className={footerLinkClassName}
                >
                  {entry.label}
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      </footer>

      <Modal
        open={Boolean(activeEntry)}
        title={activeEntry?.title ?? ""}
        onClose={closeModal}
      >
        <div className="space-y-4">
          {activeEntry?.sections.map((section, sectionIndex) => (
            <div
              key={`${activeEntry.key}-${sectionIndex}`}
              className="rounded-2xl bg-white/70 p-5 shadow-sm"
            >
              {section.heading && (
                <h3 className="text-lg font-semibold text-[var( &nbsp; color-green-dark)]">
                  {section.heading}
                </h3>
              )}
              <div className={section.heading ? "mt-2" : undefined}>
                {section.body}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
