(() => {
  const ADMIN_CONTACT_ID = "vetlearn-admin-message-contact";
  const STYLE_ID = "vetlearn-admin-message-contact-style";
  const MAILBOX_TOOLS_ID = "vetlearn-admin-mailbox-tools";
  const SELECT_CLASS = "vetlearn-admin-message-type-select";
  const CHIP_CLASS = "vetlearn-mailbox-type-chip";
  const HISTORY_CARD_CLASS = "vetlearn-admin-message-history-card";

  const TYPES = [
    { id: "app_support", label: "App support", short: "Support", keywords: ["app", "support", "help", "issue", "problem", "not working", "screen", "page"] },
    { id: "plans", label: "Plans & subscriptions", short: "Plans", keywords: ["plan", "premium", "subscription", "subscribe", "upgrade", "downgrade", "price", "pricing"] },
    { id: "accounts", label: "Accounts & login", short: "Accounts", keywords: ["account", "login", "log in", "sign in", "password", "email", "verification", "profile"] },
    { id: "billing", label: "Billing", short: "Billing", keywords: ["billing", "invoice", "payment", "card", "refund", "charge", "receipt"] },
    { id: "clinical_tools", label: "Clinical tools", short: "Tools", keywords: ["calculator", "drug", "dose", "formulary", "case", "protocol", "clinical", "cpd"] },
    { id: "bug_report", label: "Bug report", short: "Bug", keywords: ["bug", "error", "crash", "broken", "stuck", "blank", "white", "android", "vercel"] },
    { id: "feedback", label: "Feedback & ideas", short: "Feedback", keywords: ["feedback", "idea", "suggest", "request", "feature", "improve"] },
    { id: "other", label: "Other", short: "Other", keywords: [] }
  ];

  const normalise = (value) => String(value || "").trim().toLowerCase();
  const byId = (id) => TYPES.find(type => type.id === id) || TYPES[0];

  const getExplicitType = (text) => {
    const match = String(text || "").match(/^\s*\[([^\]]+)\]/);
    if (!match) return null;
    const label = normalise(match[1]);
    return TYPES.find(type => normalise(type.label) === label || normalise(type.short) === label) || null;
  };

  const inferType = (text) => {
    const explicit = getExplicitType(text);
    if (explicit) return explicit;
    const clean = normalise(text);
    return TYPES.find(type => type.id !== "other" && type.keywords.some(keyword => clean.includes(keyword))) || byId("other");
  };

  const isMessagesComposeView = () => {
    const heading = [...document.querySelectorAll("h1, h2, h3")]
      .some(element => normalise(element.textContent) === "new message");
    const searchInput = document.querySelector('input[placeholder="Search network..."]');
    return heading && Boolean(searchInput);
  };

  const findContactList = () => {
    const searchInput = document.querySelector('input[placeholder="Search network..."]');
    if (!searchInput) return null;

    const panel = searchInput.closest(".flex.flex-col") || searchInput.closest("div");
    const candidates = [...document.querySelectorAll("div")].filter(element => {
      const className = String(element.className || "");
      return className.includes("overflow-y-auto") && className.includes("space-y-3");
    });

    return candidates.find(element => panel?.contains(element) || element.closest(".h-full")) || candidates[0] || null;
  };

  const shouldShowForSearch = () => {
    const query = normalise(document.querySelector('input[placeholder="Search network..."]')?.value);
    if (!query) return true;
    return "admin".includes(query) || "vetlearn support".includes(query) || "support".includes(query);
  };

  const openAdminChat = () => {
    const target = "/messages?admin=1";
    if (window.location.pathname === "/messages") {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    window.location.href = target;
  };

  const createAdminContact = () => {
    const button = document.createElement("button");
    button.id = ADMIN_CONTACT_ID;
    button.type = "button";
    button.setAttribute("aria-label", "Message Admin support");
    button.dataset.vetlearnInjected = "true";
    button.innerHTML = `
      <div class="vetlearn-admin-message-avatar">A</div>
      <div class="vetlearn-admin-message-copy">
        <span>Admin</span>
        <small>VetLearn Support</small>
      </div>
    `;
    button.addEventListener("click", openAdminChat);
    return button;
  };

  const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ADMIN_CONTACT_ID} {
        width: 100%;
        border: 1px solid rgba(113, 207, 194, 0.55);
        border-radius: 1rem;
        padding: 1rem;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 1rem;
        background: rgba(113, 207, 194, 0.12);
        color: #113247;
        transition: background 160ms ease, transform 160ms ease;
      }
      #${ADMIN_CONTACT_ID}:active { transform: scale(0.99); }
      #${ADMIN_CONTACT_ID}:hover { background: rgba(113, 207, 194, 0.18); }
      .dark #${ADMIN_CONTACT_ID},
      [class*="bg-[#071A24]"] #${ADMIN_CONTACT_ID} {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(113, 207, 194, 0.5);
      }
      .vetlearn-admin-message-avatar {
        height: 3rem;
        width: 3rem;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 1.125rem;
        font-weight: 900;
        background: #71CFC2;
        color: #062F63;
      }
      .vetlearn-admin-message-copy { min-width: 0; flex: 1; }
      .vetlearn-admin-message-copy span {
        display: block;
        font-size: 1.125rem;
        line-height: 1.5rem;
        font-weight: 800;
      }
      .vetlearn-admin-message-copy small {
        display: block;
        margin-top: 0.125rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        opacity: 0.65;
        font-weight: 600;
      }
      #${MAILBOX_TOOLS_ID} {
        margin-bottom: 1rem;
        border: 1px solid rgba(113, 207, 194, 0.35);
        border-radius: 1rem;
        padding: 0.85rem;
        background: rgba(113, 207, 194, 0.10);
      }
      .dark #${MAILBOX_TOOLS_ID}, [class*="bg-[#071A24]"] #${MAILBOX_TOOLS_ID} {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.12);
      }
      .vetlearn-mailbox-tool-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.65rem;
        font-size: 0.78rem;
        font-weight: 900;
        letter-spacing: 0.11em;
        text-transform: uppercase;
        opacity: 0.7;
      }
      .vetlearn-mailbox-tool-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0.6rem;
      }
      @media (min-width: 720px) {
        .vetlearn-mailbox-tool-grid { grid-template-columns: minmax(0, 1fr) minmax(180px, 0.45fr); }
      }
      .vetlearn-mailbox-tool-grid input,
      .vetlearn-mailbox-tool-grid select,
      .${SELECT_CLASS} {
        width: 100%;
        border: 0;
        border-radius: 0.8rem;
        padding: 0.8rem 0.9rem;
        outline: none;
        background: rgba(255, 255, 255, 0.9);
        color: #113247;
        font-size: 0.875rem;
        font-weight: 700;
      }
      .dark .vetlearn-mailbox-tool-grid input,
      .dark .vetlearn-mailbox-tool-grid select,
      .dark .${SELECT_CLASS},
      [class*="bg-[#071A24]"] .vetlearn-mailbox-tool-grid input,
      [class*="bg-[#071A24]"] .vetlearn-mailbox-tool-grid select,
      [class*="bg-[#071A24]"] .${SELECT_CLASS} {
        background: rgba(0, 0, 0, 0.24);
        color: #fff;
      }
      .vetlearn-mailbox-type-summary {
        margin-top: 0.75rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }
      .vetlearn-mailbox-type-button,
      .${CHIP_CLASS} {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid rgba(113, 207, 194, 0.35);
        background: rgba(113, 207, 194, 0.15);
        color: #0B3760;
        padding: 0.35rem 0.6rem;
        font-size: 0.68rem;
        font-weight: 900;
        line-height: 1;
        white-space: nowrap;
      }
      .dark .vetlearn-mailbox-type-button,
      .dark .${CHIP_CLASS},
      [class*="bg-[#071A24]"] .vetlearn-mailbox-type-button,
      [class*="bg-[#071A24]"] .${CHIP_CLASS} {
        color: #d9fffa;
        background: rgba(113, 207, 194, 0.16);
        border-color: rgba(113, 207, 194, 0.4);
      }
      .vetlearn-mailbox-type-button[data-active="true"] {
        background: #71CFC2;
        color: #062F63;
      }
      .vetlearn-admin-type-field {
        margin-bottom: 0.6rem;
      }
      .vetlearn-admin-type-field label {
        display: block;
        margin-bottom: 0.35rem;
        font-size: 0.72rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.62;
      }
      .${HISTORY_CARD_CLASS} {
        cursor: pointer;
        scroll-margin-top: 6rem;
      }
      .${HISTORY_CARD_CLASS}:focus {
        outline: 3px solid rgba(113, 207, 194, 0.7);
        outline-offset: 3px;
      }
      .${HISTORY_CARD_CLASS}[data-vetlearn-history-highlight="true"] {
        box-shadow: 0 0 0 3px rgba(113, 207, 194, 0.85), 0 18px 36px rgba(11, 55, 96, 0.18);
      }
      [data-vetlearn-mailbox-hidden="true"] { display: none !important; }
    `;
    document.head.appendChild(style);
  };

  const injectAdminContact = () => {
    const existing = document.getElementById(ADMIN_CONTACT_ID);
    if (!isMessagesComposeView()) {
      existing?.remove();
      return;
    }

    ensureStyles();
    const list = findContactList();
    if (!list) return;

    const contact = existing || createAdminContact();
    contact.style.display = shouldShowForSearch() ? "flex" : "none";

    if (contact.parentElement !== list || list.firstElementChild !== contact) {
      list.prepend(contact);
    }
  };

  const getMailboxSection = () => {
    return [...document.querySelectorAll("section")].find(section => {
      const heading = section.querySelector("h2");
      return normalise(heading?.textContent) === "admin mailbox";
    }) || null;
  };

  const getThreadCards = (section) => {
    if (!section) return [];
    return [...section.querySelectorAll('button[title="Delete mailbox thread"]')]
      .map(button => button.closest("div.relative"))
      .filter(Boolean);
  };

  const getCardType = (card) => inferType(card?.textContent || "");

  const addTypeChip = (card) => {
    const type = getCardType(card);
    card.dataset.vetlearnMailboxType = type.id;
    const existing = card.querySelector(`.${CHIP_CLASS}`);
    if (existing) {
      existing.textContent = type.label;
      return;
    }
    const metaRow = [...card.querySelectorAll("div")].find(element => String(element.className || "").includes("uppercase"));
    const chip = document.createElement("span");
    chip.className = CHIP_CLASS;
    chip.textContent = type.label;
    if (metaRow) metaRow.prepend(chip);
    else card.prepend(chip);
  };

  const getOrCreateMailboxTools = (section) => {
    let tools = document.getElementById(MAILBOX_TOOLS_ID);
    if (tools && section.contains(tools)) return tools;

    tools?.remove();
    tools = document.createElement("div");
    tools.id = MAILBOX_TOOLS_ID;
    tools.innerHTML = `
      <div class="vetlearn-mailbox-tool-title">
        <span>Mailbox tools</span>
        <span data-vetlearn-mailbox-total>0 threads</span>
      </div>
      <div class="vetlearn-mailbox-tool-grid">
        <input data-vetlearn-mailbox-search type="search" placeholder="Search name, email, message or type" />
        <select data-vetlearn-mailbox-type>
          <option value="all">All types</option>
          ${TYPES.map(type => `<option value="${type.id}">${type.label}</option>`).join("")}
        </select>
      </div>
      <div class="vetlearn-mailbox-type-summary" data-vetlearn-mailbox-summary></div>
    `;

    const existingFilters = [...section.querySelectorAll("div")].find(element => {
      const text = normalise(element.textContent);
      return text.includes("all (") && text.includes("unread") && text.includes("resolved");
    });
    (existingFilters || section.firstElementChild)?.before(tools);

    tools.querySelector("[data-vetlearn-mailbox-search]")?.addEventListener("input", applyMailboxFilters);
    tools.querySelector("[data-vetlearn-mailbox-type]")?.addEventListener("change", applyMailboxFilters);
    return tools;
  };

  const applyMailboxFilters = () => {
    const section = getMailboxSection();
    if (!section) return;
    ensureStyles();

    const cards = getThreadCards(section);
    cards.forEach(addTypeChip);

    const tools = getOrCreateMailboxTools(section);
    const query = normalise(tools.querySelector("[data-vetlearn-mailbox-search]")?.value);
    const selectedType = tools.querySelector("[data-vetlearn-mailbox-type]")?.value || "all";
    const counts = Object.fromEntries(TYPES.map(type => [type.id, 0]));
    let visibleCount = 0;

    cards.forEach(card => {
      const type = getCardType(card);
      counts[type.id] = (counts[type.id] || 0) + 1;
      const text = normalise(card.textContent);
      const matchesQuery = !query || text.includes(query) || normalise(type.label).includes(query);
      const matchesType = selectedType === "all" || type.id === selectedType;
      const visible = matchesQuery && matchesType;
      card.dataset.vetlearnMailboxHidden = visible ? "false" : "true";
      if (visible) visibleCount += 1;
    });

    const total = tools.querySelector("[data-vetlearn-mailbox-total]");
    if (total) total.textContent = `${visibleCount} of ${cards.length} thread${cards.length === 1 ? "" : "s"}`;

    const summary = tools.querySelector("[data-vetlearn-mailbox-summary]");
    if (summary) {
      summary.innerHTML = TYPES
        .filter(type => counts[type.id] > 0)
        .map(type => `<button type="button" class="vetlearn-mailbox-type-button" data-type="${type.id}" data-active="${selectedType === type.id}">${type.short}: ${counts[type.id]}</button>`)
        .join("");
      summary.querySelectorAll("button[data-type]").forEach(button => {
        button.addEventListener("click", () => {
          const select = tools.querySelector("[data-vetlearn-mailbox-type]");
          select.value = select.value === button.dataset.type ? "all" : button.dataset.type;
          applyMailboxFilters();
        });
      });
    }
  };

  const findAdminChatComposer = () => {
    const hasAdminHeading = [...document.querySelectorAll("h3")].some(heading => normalise(heading.textContent) === "admin");
    if (!hasAdminHeading) return null;
    const textarea = document.querySelector('textarea[placeholder="Type a message..."]');
    return textarea ? { textarea, host: textarea.closest("form") || textarea.parentElement, storageKey: "user_admin" } : null;
  };

  const findAdminDashboardComposers = () => {
    return [...document.querySelectorAll('textarea[placeholder="Write as Admin..."], textarea[placeholder="Reply as Admin..."]')]
      .map(textarea => ({
        textarea,
        host: textarea.parentElement,
        storageKey: textarea.placeholder.includes("Reply") ? "admin_reply" : "admin_compose"
      }))
      .filter(item => item.host);
  };

  const addTypeSelector = ({ textarea, host, storageKey }) => {
    if (!textarea || !host || host.querySelector(`.${SELECT_CLASS}`)) return;
    ensureStyles();

    const wrapper = document.createElement("div");
    wrapper.className = "vetlearn-admin-type-field";
    wrapper.innerHTML = `
      <label>${storageKey === "user_admin" ? "Message type" : "Admin mailbox type"}</label>
      <select class="${SELECT_CLASS}" data-storage-key="${storageKey}">
        ${TYPES.map(type => `<option value="${type.id}">${type.label}</option>`).join("")}
      </select>
    `;
    textarea.before(wrapper);

    const select = wrapper.querySelector("select");
    const saved = window.localStorage?.getItem(`vetlearn-admin-message-type-${storageKey}`);
    if (saved && TYPES.some(type => type.id === saved)) select.value = saved;
    select.addEventListener("change", () => {
      try { window.localStorage?.setItem(`vetlearn-admin-message-type-${storageKey}`, select.value); } catch {}
    });
  };

  const ensureTypeSelectors = () => {
    const userComposer = findAdminChatComposer();
    if (userComposer) addTypeSelector(userComposer);
    findAdminDashboardComposers().forEach(addTypeSelector);
  };

  const prefixTextAreaWithType = (textarea) => {
    const host = textarea?.closest("form") || textarea?.parentElement;
    const select = host?.querySelector(`.${SELECT_CLASS}`) || textarea?.parentElement?.querySelector(`.${SELECT_CLASS}`);
    if (!textarea || !select) return;
    const type = byId(select.value);
    const raw = String(textarea.value || "");
    const withoutOldPrefix = raw.replace(/^\s*\[[^\]]+\]\s*/, "");
    const nextValue = withoutOldPrefix.trim() ? `[${type.label}] ${withoutOldPrefix}` : `[${type.label}]`;
    if (nextValue === raw) return;
    textarea.value = nextValue;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const maybePrefixOnAction = (event) => {
    const button = event.target?.closest?.("button");
    if (!button) return;
    const label = normalise(button.textContent);
    if (!label.includes("send") && !label.includes("reply")) return;

    const area = button.closest("form")?.querySelector("textarea")
      || button.parentElement?.parentElement?.querySelector("textarea")
      || button.closest("section")?.querySelector('textarea[placeholder="Reply as Admin..."], textarea[placeholder="Write as Admin..."]');

    if (area && (area.placeholder === "Type a message..." || area.placeholder === "Write as Admin..." || area.placeholder === "Reply as Admin...")) {
      prefixTextAreaWithType(area);
    }
  };

  const getMessageHistorySection = () => {
    return [...document.querySelectorAll("section")].find(section => {
      const heading = section.querySelector("h2");
      return normalise(heading?.textContent) === "message history";
    }) || null;
  };

  const getHistoryCards = () => {
    const section = getMessageHistorySection();
    if (!section) return [];
    return [...section.querySelectorAll("h3")]
      .map(heading => heading.closest("div.rounded-lg"))
      .filter(Boolean);
  };

  const highlightAndScrollToCard = (card) => {
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.dataset.vetlearnHistoryHighlight = "true";
    card.focus?.({ preventScroll: true });
    window.setTimeout(() => {
      card.dataset.vetlearnHistoryHighlight = "false";
    }, 1800);
  };

  const prepareAdminMessageHistory = () => {
    ensureStyles();
    getHistoryCards().forEach((card, index) => {
      card.classList.add(HISTORY_CARD_CLASS);
      card.tabIndex = 0;
      card.dataset.vetlearnAdminMessageIndex = String(index + 1);
      if (card.dataset.vetlearnHistoryReady === "true") return;
      card.dataset.vetlearnHistoryReady = "true";
      card.addEventListener("click", event => {
        if (event.target?.closest?.("button")) return;
        highlightAndScrollToCard(card);
      });
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          highlightAndScrollToCard(card);
        }
      });
    });
  };

  const run = () => {
    injectAdminContact();
    applyMailboxFilters();
    ensureTypeSelectors();
    prepareAdminMessageHistory();
  };

  const scheduleRun = () => window.requestAnimationFrame(run);

  document.addEventListener("input", () => window.setTimeout(run, 0), true);
  document.addEventListener("pointerdown", maybePrefixOnAction, true);
  document.addEventListener("submit", event => {
    const textarea = event.target?.querySelector?.("textarea");
    if (textarea) prefixTextAreaWithType(textarea);
  }, true);
  document.addEventListener("click", () => window.setTimeout(run, 80), true);
  window.addEventListener("popstate", scheduleRun);

  const observer = new MutationObserver(scheduleRun);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRun, { once: true });
  } else {
    scheduleRun();
  }
})();
