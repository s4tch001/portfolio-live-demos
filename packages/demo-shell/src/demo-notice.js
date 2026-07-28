import {
  DAILY_RESET_NOTICE,
  getDemoContract
} from "./contracts.js";
import {
  DEMO_DEPLOYMENT_NOTICE,
  GENERATED_SAMPLE_NOTICE
} from "./baselines.js";

export const DEMO_NOTICE_ELEMENT = "portfolio-demo-notice";
export const DEMO_NOTICE_HEIGHT_PROPERTY = "--portfolio-demo-notice-height";
export const ROBOTS_DIRECTIVE = "noindex,nofollow,noarchive,nosnippet,noimageindex";

const styles = `
  :host {
    --demo-notice-background: #111827;
    --demo-notice-border: #374151;
    --demo-notice-accent: #fbbf24;
    --demo-notice-text: #f9fafb;
    --demo-notice-muted: #d1d5db;
    color-scheme: dark;
    display: block;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    position: sticky;
    top: 0;
    z-index: 2147483000;
  }

  .notice {
    align-items: center;
    background: var(--demo-notice-background);
    border-bottom: 1px solid var(--demo-notice-border);
    box-sizing: border-box;
    color: var(--demo-notice-text);
    display: grid;
    gap: 0.5rem 1rem;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 0.7rem clamp(0.8rem, 3vw, 1.4rem);
    width: 100%;
  }

  .notice.is-collapsed {
    grid-template-columns: 1fr;
    padding-block: 0.45rem;
  }

  .notice.is-collapsed .copy,
  .notice.is-collapsed details {
    display: none;
  }

  .copy {
    min-width: 0;
  }

  .title {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.86rem;
    font-weight: 750;
    gap: 0.5rem;
    line-height: 1.35;
    margin: 0;
  }

  .badge {
    background: var(--demo-notice-accent);
    border-radius: 999px;
    color: #111827;
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 850;
    letter-spacing: 0.06em;
    padding: 0.18rem 0.48rem;
    text-transform: uppercase;
  }

  .message {
    color: var(--demo-notice-muted);
    font-size: 0.76rem;
    line-height: 1.45;
    margin: 0.2rem 0 0;
  }

  .message + .message {
    margin-top: 0.1rem;
  }

  details {
    justify-self: end;
    position: relative;
  }

  summary {
    border: 1px solid #6b7280;
    border-radius: 0.45rem;
    cursor: pointer;
    font-size: 0.76rem;
    font-weight: 700;
    list-style-position: inside;
    padding: 0.42rem 0.62rem;
    white-space: nowrap;
  }

  .toggle {
    background: transparent;
    border: 1px solid #6b7280;
    border-radius: 999px;
    color: var(--demo-notice-text);
    cursor: pointer;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 800;
    justify-self: end;
    letter-spacing: 0.02em;
    padding: 0.38rem 0.62rem;
    white-space: nowrap;
  }

  .toggle:hover,
  .toggle:focus-visible {
    border-color: var(--demo-notice-accent);
    color: var(--demo-notice-accent);
    outline: none;
  }

  .notice.is-collapsed .toggle {
    justify-self: center;
  }

  .credentials {
    background: #1f2937;
    border: 1px solid #4b5563;
    border-radius: 0.55rem;
    box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.32);
    box-sizing: border-box;
    color: var(--demo-notice-text);
    max-height: min(24rem, 70vh);
    min-width: min(24rem, calc(100vw - 1.6rem));
    overflow: auto;
    padding: 0.85rem;
    position: absolute;
    right: 0;
    top: calc(100% + 0.45rem);
  }

  .credentials p {
    color: var(--demo-notice-muted);
    font-size: 0.73rem;
    line-height: 1.45;
    margin: 0 0 0.65rem;
  }

  .credentials ul {
    display: grid;
    gap: 0.55rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .credentials li {
    border-top: 1px solid #374151;
    display: grid;
    font-size: 0.75rem;
    gap: 0.2rem;
    padding-top: 0.55rem;
  }

  .credentials li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  code {
    color: #fde68a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    overflow-wrap: anywhere;
    user-select: all;
  }

  @media (max-width: 44rem) {
    .notice {
      grid-template-columns: 1fr;
    }

    details {
      justify-self: start;
    }

    .toggle {
      justify-self: start;
    }

    .credentials {
      left: 0;
      right: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      scroll-behavior: auto !important;
    }
  }
`;

function fallbackContract() {
  return {
    id: "unknown",
    name: "Portfolio project",
    credentials: []
  };
}

function resolveContract(contractOrProjectId) {
  if (typeof contractOrProjectId === "string" && contractOrProjectId) {
    try {
      return getDemoContract(contractOrProjectId);
    } catch {
      return fallbackContract();
    }
  }
  if (contractOrProjectId && typeof contractOrProjectId === "object") {
    return contractOrProjectId;
  }
  return fallbackContract();
}

export function buildDemoNoticeModel(contractOrProjectId) {
  const contract = resolveContract(contractOrProjectId);
  return Object.freeze({
    projectId: String(contract.id ?? "unknown"),
    title: String(contract.name ?? "Portfolio project") + " - Portfolio preview",
    message: DAILY_RESET_NOTICE,
    sampleDataMessage: String(
      contract.preview?.sampleDataNotice ?? GENERATED_SAMPLE_NOTICE
    ),
    deploymentMessage: String(
      contract.preview?.deploymentNotice ?? DEMO_DEPLOYMENT_NOTICE
    ),
    navigationHint: contract.preview?.navigationHint
      ? String(contract.preview.navigationHint)
      : null,
    credentials: Object.freeze(
      (Array.isArray(contract.credentials) ? contract.credentials : []).map((entry) =>
        Object.freeze({
          audience: String(entry.audience ?? "Demo access"),
          username: entry.username ? String(entry.username) : null,
          password: entry.password ? String(entry.password) : null
        })
      )
    )
  });
}

function appendTextRow(documentRef, parent, label, value) {
  if (!value) {
    return;
  }
  const row = documentRef.createElement("span");
  row.textContent = label + ": ";
  const code = documentRef.createElement("code");
  code.textContent = value;
  row.append(code);
  parent.append(row);
}

export function applyDemoDocumentGuards(documentRef = globalThis.document) {
  if (!documentRef?.head || typeof documentRef.createElement !== "function") {
    return false;
  }

  let robots = documentRef.head.querySelector?.('meta[name="robots"]');
  if (!robots) {
    robots = documentRef.createElement("meta");
    robots.name = "robots";
    documentRef.head.append(robots);
  }
  robots.content = ROBOTS_DIRECTIVE;
  return true;
}

export function defineDemoNotice(
  registry = globalThis.customElements,
  HTMLElementBase = globalThis.HTMLElement,
  documentRef = globalThis.document
) {
  if (!registry || !HTMLElementBase || !documentRef) {
    return false;
  }
  if (registry.get(DEMO_NOTICE_ELEMENT)) {
    applyDemoDocumentGuards(documentRef);
    return true;
  }

  class PortfolioDemoNotice extends HTMLElementBase {
    static get observedAttributes() {
      return ["project-id"];
    }

    #contract;
    #collapsed = false;
    #heightFrame;
    #resizeObserver;

    set contract(value) {
      this.#contract = value;
      this.render();
    }

    get contract() {
      return this.#contract;
    }

    connectedCallback() {
      this.#collapsed = this.#readCollapsedPreference();
      this.render();
      this.#observeHeight();
    }

    disconnectedCallback() {
      this.#resizeObserver?.disconnect();
      this.#resizeObserver = undefined;

      const ownerDocument = this.ownerDocument ?? documentRef;
      const view = ownerDocument.defaultView;
      if (this.#heightFrame !== undefined && typeof view?.cancelAnimationFrame === "function") {
        view.cancelAnimationFrame(this.#heightFrame);
      }
      this.#heightFrame = undefined;

      if (!ownerDocument.querySelector?.(DEMO_NOTICE_ELEMENT)) {
        ownerDocument.documentElement?.style?.removeProperty?.(DEMO_NOTICE_HEIGHT_PROPERTY);
      }
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        this.render();
      }
    }

    #publishHeight() {
      const height = Math.ceil(Number(this.getBoundingClientRect?.().height ?? 0));
      const ownerDocument = this.ownerDocument ?? documentRef;
      ownerDocument.documentElement?.style?.setProperty?.(DEMO_NOTICE_HEIGHT_PROPERTY, `${Math.max(0, height)}px`);
    }

    #observeHeight() {
      this.#resizeObserver?.disconnect();
      const ownerDocument = this.ownerDocument ?? documentRef;
      const view = ownerDocument.defaultView;
      const ResizeObserverBase = view?.ResizeObserver ?? globalThis.ResizeObserver;
      if (typeof ResizeObserverBase === "function") {
        this.#resizeObserver = new ResizeObserverBase(() => this.#publishHeight());
        this.#resizeObserver.observe(this);
      }

      if (typeof view?.requestAnimationFrame === "function") {
        this.#heightFrame = view.requestAnimationFrame(() => {
          this.#heightFrame = undefined;
          this.#publishHeight();
        });
      } else {
        this.#publishHeight();
      }
    }

    #preferenceKey() {
      const model = buildDemoNoticeModel(this.#contract ?? this.getAttribute("project-id"));
      return `pauuu-demo-notice:${model.projectId}:collapsed`;
    }

    #readCollapsedPreference() {
      try {
        return this.ownerDocument?.defaultView?.localStorage?.getItem(this.#preferenceKey()) === "true";
      } catch {
        return false;
      }
    }

    #writeCollapsedPreference() {
      try {
        this.ownerDocument?.defaultView?.localStorage?.setItem(
          this.#preferenceKey(),
          this.#collapsed ? "true" : "false"
        );
      } catch {
        // Storage can be blocked in private/sandboxed browsers; the button
        // still works for the current render.
      }
    }

    #toggleCollapsed() {
      this.#collapsed = !this.#collapsed;
      this.#writeCollapsedPreference();
      this.render();
      this.#observeHeight();
    }

    render() {
      const ownerDocument = this.ownerDocument ?? documentRef;
      const model = buildDemoNoticeModel(this.#contract ?? this.getAttribute("project-id"));
      const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      const style = ownerDocument.createElement("style");
      style.textContent = styles;

      const notice = ownerDocument.createElement("aside");
      notice.className = this.#collapsed ? "notice is-collapsed" : "notice";
      notice.setAttribute("role", "note");
      notice.setAttribute("aria-label", "Portfolio demo notice");
      notice.setAttribute("part", "notice");

      const copy = ownerDocument.createElement("div");
      copy.className = "copy";

      const title = ownerDocument.createElement("p");
      title.className = "title";
      const badge = ownerDocument.createElement("span");
      badge.className = "badge";
      badge.textContent = "Demo only";
      const titleText = ownerDocument.createElement("span");
      titleText.textContent = model.title;
      title.append(badge, titleText);

      const message = ownerDocument.createElement("p");
      message.className = "message";
      message.textContent = model.message;
      const sampleDataMessage = ownerDocument.createElement("p");
      sampleDataMessage.className = "message";
      sampleDataMessage.textContent = model.sampleDataMessage;
      const deploymentMessage = ownerDocument.createElement("p");
      deploymentMessage.className = "message";
      deploymentMessage.textContent = model.deploymentMessage;
      copy.append(title, message, sampleDataMessage, deploymentMessage);
      if (model.navigationHint) {
        const navigationHint = ownerDocument.createElement("p");
        navigationHint.className = "message";
        navigationHint.textContent = model.navigationHint;
        copy.append(navigationHint);
      }
      notice.append(copy);

      if (model.credentials.length > 0) {
        const details = ownerDocument.createElement("details");
        const summary = ownerDocument.createElement("summary");
        summary.textContent = "Test credentials";
        const credentialPanel = ownerDocument.createElement("div");
        credentialPanel.className = "credentials";
        const credentialNote = ownerDocument.createElement("p");
        credentialNote.textContent =
          "These public credentials are only for this disposable demo and cannot be changed.";
        const list = ownerDocument.createElement("ul");

        for (const entry of model.credentials) {
          const item = ownerDocument.createElement("li");
          const audience = ownerDocument.createElement("strong");
          audience.textContent = entry.audience;
          item.append(audience);
          appendTextRow(ownerDocument, item, "Username", entry.username);
          appendTextRow(ownerDocument, item, "Password", entry.password);
          list.append(item);
        }

        credentialPanel.append(credentialNote, list);
        details.append(summary, credentialPanel);
        notice.append(details);
      }

      const toggle = ownerDocument.createElement("button");
      toggle.className = "toggle";
      toggle.type = "button";
      toggle.textContent = this.#collapsed ? "Show demo notice" : "Hide notice";
      toggle.setAttribute("aria-expanded", String(!this.#collapsed));
      toggle.addEventListener("click", () => this.#toggleCollapsed());
      notice.append(toggle);

      shadow.replaceChildren(style, notice);
      this.dataset.projectId = model.projectId;
      this.#publishHeight();
    }
  }

  registry.define(DEMO_NOTICE_ELEMENT, PortfolioDemoNotice);
  applyDemoDocumentGuards(documentRef);
  return true;
}
