(() => {
  const ADMIN_CONTACT_ID = "vetlearn-admin-message-contact";

  const normalise = (value) => String(value || "").trim().toLowerCase();

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
    if (document.getElementById("vetlearn-admin-message-contact-style")) return;
    const style = document.createElement("style");
    style.id = "vetlearn-admin-message-contact-style";
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

  const scheduleInject = () => window.requestAnimationFrame(injectAdminContact);

  document.addEventListener("input", scheduleInject, true);
  document.addEventListener("click", () => window.setTimeout(injectAdminContact, 60), true);
  window.addEventListener("popstate", scheduleInject);

  const observer = new MutationObserver(scheduleInject);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInject, { once: true });
  } else {
    scheduleInject();
  }
})();
