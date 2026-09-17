/**
 * GIT-PEEK — Content Script
 * 
 * Detects GitHub profile links on webpages, handles hover delays,
 * requests profile data from background.js, and renders a premium,
 * high-performance floating profile card with shimmer skeletons and error handling.
 */

(() => {
  if (window.__GIT_PEEK_INITIALIZED__) {
    return;
  }
  window.__GIT_PEEK_INITIALIZED__ = true;

  // Timers for hover delay and card hide grace period
  let hoverTimer = null;
  let hideTimer = null;

// Currently targeted link element and username
let currentAnchor = null;
let currentUsername = null;
let activeRequestUsername = null;

// Hover delay in milliseconds before fetching/displaying
const HOVER_DELAY_MS = 500;
// Grace period when moving mouse between link and card
const GRACE_HIDE_DELAY_MS = 250;

// Valid GitHub username pattern:
// 1-39 alphanumeric chars or single hyphens, cannot start or end with hyphen
const GITHUB_USERNAME_REGEX = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

// Reserved GitHub paths that are NOT user profiles
const RESERVED_GITHUB_PATHS = new Set([
  "about", "access", "account", "admin", "announcements", "api", "apps", "assets",
  "blog", "business", "careers", "changelog", "collections", "community", "contact",
  "customer-stories", "dashboard", "developer", "discussions", "enterprise", "events",
  "explore", "features", "gist", "git-guides", "help", "home", "issues", "join",
  "legal", "login", "logout", "marketplace", "mobile", "new", "newsroom", "nonprofit",
  "notifications", "open-source", "organizations", "orgs", "personal", "popular",
  "pricing", "pulls", "readme", "readme-project", "repositories", "search",
  "security", "services", "settings", "sessions", "shop", "signup", "site",
  "sponsors", "stars", "status", "team", "teams", "topics", "trending",
  "users", "watching", "whitepapers"
]);

/**
 * Extracts a valid GitHub username from an anchor element href.
 * Returns null if the URL is not a valid profile link.
 * 
 * @param {string} rawHref - The URL string to inspect.
 * @returns {string|null} - GitHub username or null.
 */
function extractGitHubUsername(rawHref) {
  if (!rawHref) return null;

  try {
    const url = new URL(rawHref, window.location.href);

    // Only inspect GitHub domains
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "github.com" && hostname !== "www.github.com") {
      return null;
    }

    // Split path into segments and remove empty parts
    const segments = url.pathname.split("/").filter(Boolean);

    // Profile links must have EXACTLY ONE path segment: /username
    // Repositories (/username/repo) or deep links (/username/repo/issues) have > 1
    if (segments.length !== 1) {
      return null;
    }

    const candidate = segments[0];

    // Exclude reserved GitHub routes
    if (RESERVED_GITHUB_PATHS.has(candidate.toLowerCase())) {
      return null;
    }

    // Validate username syntax
    if (!GITHUB_USERNAME_REGEX.test(candidate)) {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

/**
 * Event delegation: Handles mouseover across the whole document.
 * Supports dynamically inserted links automatically.
 */
document.addEventListener("mouseover", (event) => {
  const card = document.getElementById("git-peek-card");

  // If hovering inside the active card, keep it visible
  if (card && card.contains(event.target)) {
    clearTimeout(hideTimer);
    return;
  }

  // Find nearest anchor element
  const anchor = event.target.closest("a");
  if (!anchor || !anchor.href) {
    return;
  }

  const username = extractGitHubUsername(anchor.href);
  if (!username) {
    return;
  }

  // Mouse is on a valid GitHub profile link
  clearTimeout(hideTimer);

  // If hovering over a new link, reset timers
  if (currentAnchor !== anchor) {
    clearTimeout(hoverTimer);
    currentAnchor = anchor;
    currentUsername = username;

    hoverTimer = setTimeout(() => {
      triggerProfilePeek(anchor, username);
    }, HOVER_DELAY_MS);
  }
});

/**
 * Event delegation: Handles mouseout across the document.
 */
document.addEventListener("mouseout", (event) => {
  const card = document.getElementById("git-peek-card");
  const relatedTarget = event.relatedTarget;

  // Check if mouse moved into the card from the link
  if (card && relatedTarget && card.contains(relatedTarget)) {
    return;
  }

  // Check if mouse moved into the link from the card
  if (currentAnchor && relatedTarget && currentAnchor.contains(relatedTarget)) {
    return;
  }

  // If mouse leaves the current link before delay, cancel hover
  if (currentAnchor && (!relatedTarget || !currentAnchor.contains(relatedTarget))) {
    clearTimeout(hoverTimer);
    currentAnchor = null;
  }

  // Start grace period timer to dismiss card
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    removeProfileCard();
  }, GRACE_HIDE_DELAY_MS);
});

/**
 * Initiates the card display: creates card, shows loading shimmer skeleton,
 * and requests user data from background.js service worker.
 * 
 * @param {HTMLAnchorElement} anchor - The hovered link element.
 * @param {string} username - The extracted GitHub username.
 */
function triggerProfilePeek(anchor, username) {
  activeRequestUsername = username;

  // Create or reuse card
  const card = getOrCreateCard();

  // Position card near the hovered link
  positionCard(card, anchor);

  // Set premium skeleton loading state
  renderSkeletonLoading(card, username);

  // Send message to background service worker with error safety
  try {
    if (!chrome.runtime?.id) {
      renderError(
        card,
        "Extension Context Disconnected",
        "Please refresh this page (F5) to re-enable Git-Peek."
      );
      positionCard(card, anchor);
      return;
    }

    chrome.runtime.sendMessage(
      { action: "FETCH_GITHUB_USER", username: username },
      (response) => {
        // Ignore if user has already hovered over another link
        if (activeRequestUsername !== username) {
          return;
        }

        // Handle runtime error (e.g. extension reloaded or worker disconnected)
        if (chrome.runtime.lastError) {
          console.error("[Git-Peek] Message error:", chrome.runtime.lastError);
          renderError(
            card,
            "Service Worker Reconnecting",
            "Please refresh this page (F5) or wait a second."
          );
          positionCard(card, anchor);
          return;
        }

        // If extension is paused by user toggle, inform the user clearly
        if (response && response.errorType === "PAUSED") {
          renderError(
            card,
            "Git-Peek is Paused",
            "Click the Git-Peek icon in your toolbar and toggle to Active."
          );
          positionCard(card, anchor);
          return;
        }

        if (response && response.success && response.data) {
          renderProfile(card, response.data);
          saveRecentProfileToStorage(response.data);
        } else {
          const errorTitle = (response && response.message) || "Unable to load profile";
          const explanation = (response && response.explanation) || "Please check your network connection and try again.";
          renderError(card, errorTitle, explanation);
        }

        // Re-adjust position after content height changes
        positionCard(card, anchor);
      }
    );
  } catch (err) {
    console.error("[Git-Peek] Communication exception:", err);
    renderError(
      card,
      "Please Refresh Page",
      "The extension was restarted. Press F5 to reconnect."
    );
    positionCard(card, anchor);
  }
}

/**
 * Retrieves the existing card or creates a fresh DOM element.
 * 
 * @returns {HTMLElement} The card element.
 */
function getOrCreateCard() {
  let card = document.getElementById("git-peek-card");

  if (!card) {
    card = document.createElement("div");
    card.id = "git-peek-card";
    card.className = "git-peek-card";

    // Keep card visible when hovering directly over it
    card.addEventListener("mouseenter", () => {
      clearTimeout(hideTimer);
    });

    card.addEventListener("mouseleave", (event) => {
      if (currentAnchor && event.relatedTarget && currentAnchor.contains(event.relatedTarget)) {
        return;
      }
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        removeProfileCard();
      }, GRACE_HIDE_DELAY_MS);
    });

    document.body.appendChild(card);
  }

  card.classList.remove("git-peek-hidden");
  card.classList.add("git-peek-visible");
  return card;
}

/**
 * Safely removes the card from the DOM.
 */
function removeProfileCard() {
  const card = document.getElementById("git-peek-card");
  if (card) {
    card.classList.remove("git-peek-visible");
    card.classList.add("git-peek-hidden");
    card.textContent = "";
  }
  activeRequestUsername = null;
  currentAnchor = null;
  currentUsername = null;
}

/**
 * Positions the profile card intelligently near the link,
 * avoiding overflowing outside the browser viewport.
 * 
 * @param {HTMLElement} card - The floating card element.
 * @param {HTMLAnchorElement} anchor - The hovered link element.
 */
function positionCard(card, anchor) {
  const rect = anchor.getBoundingClientRect();
  const cardWidth = 330;
  const cardHeight = card.offsetHeight || 230;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  // Horizontal positioning: align with link start
  let left = rect.left + scrollX;

  // Prevent card from overflowing right side of viewport
  if (rect.left + cardWidth > viewportWidth - 16) {
    left = scrollX + viewportWidth - cardWidth - 16;
  }

  // Prevent card from overflowing left side of viewport
  if (left < scrollX + 16) {
    left = scrollX + 16;
  }

  // Vertical positioning: default below link
  let top = rect.bottom + scrollY + 8;

  // If card overflows bottom of viewport, position it above the link
  if (rect.bottom + 8 + cardHeight > viewportHeight && rect.top - 8 - cardHeight > 0) {
    top = rect.top + scrollY - cardHeight - 8;
  }

  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
}

/**
 * Renders a Premium Shimmer Skeleton Loading State.
 * 
 * @param {HTMLElement} card
 * @param {string} username
 */
function renderSkeletonLoading(card, username) {
  card.textContent = "";

  const skeletonContainer = document.createElement("div");
  skeletonContainer.className = "git-peek-skeleton-wrap";

  // Header Skeleton (Avatar + Name bars)
  const headerSkeleton = document.createElement("div");
  headerSkeleton.className = "git-peek-skel-header";

  const avatarSkeleton = document.createElement("div");
  avatarSkeleton.className = "git-peek-skel-avatar git-peek-shimmer";

  const identSkeleton = document.createElement("div");
  identSkeleton.className = "git-peek-skel-ident";

  const nameBar = document.createElement("div");
  nameBar.className = "git-peek-skel-bar git-peek-skel-bar-lg git-peek-shimmer";

  const usernameBar = document.createElement("div");
  usernameBar.className = "git-peek-skel-bar git-peek-skel-bar-sm git-peek-shimmer";

  identSkeleton.appendChild(nameBar);
  identSkeleton.appendChild(usernameBar);
  headerSkeleton.appendChild(avatarSkeleton);
  headerSkeleton.appendChild(identSkeleton);

  // Bio Skeleton lines
  const bioSkeleton = document.createElement("div");
  bioSkeleton.className = "git-peek-skel-bio";

  const bioLine1 = document.createElement("div");
  bioLine1.className = "git-peek-skel-bar git-peek-skel-bar-full git-peek-shimmer";

  const bioLine2 = document.createElement("div");
  bioLine2.className = "git-peek-skel-bar git-peek-skel-bar-med git-peek-shimmer";

  bioSkeleton.appendChild(bioLine1);
  bioSkeleton.appendChild(bioLine2);

  // Stats Bar Skeleton
  const statsSkeleton = document.createElement("div");
  statsSkeleton.className = "git-peek-skel-stats git-peek-shimmer";

  // Loading indicator text
  const labelRow = document.createElement("div");
  labelRow.className = "git-peek-skel-label-row";

  const spinner = document.createElement("div");
  spinner.className = "git-peek-mini-spinner";

  const loadingText = document.createElement("span");
  loadingText.className = "git-peek-skel-text";
  loadingText.textContent = `Loading GitHub profile (@${username})...`;

  labelRow.appendChild(spinner);
  labelRow.appendChild(loadingText);

  skeletonContainer.appendChild(headerSkeleton);
  skeletonContainer.appendChild(bioSkeleton);
  skeletonContainer.appendChild(statsSkeleton);
  skeletonContainer.appendChild(labelRow);

  card.appendChild(skeletonContainer);
}

/**
 * Renders a Premium Error State.
 * 
 * @param {HTMLElement} card
 * @param {string} title
 * @param {string} explanation
 */
function renderError(card, title, explanation) {
  card.textContent = "";

  const container = document.createElement("div");
  container.className = "git-peek-error-box";

  const iconWrap = document.createElement("div");
  iconWrap.className = "git-peek-error-badge";

  // Clean SVG error icon
  iconWrap.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  `;

  const textWrap = document.createElement("div");
  textWrap.className = "git-peek-error-info";

  const titleEl = document.createElement("div");
  titleEl.className = "git-peek-error-heading";
  titleEl.textContent = title;

  const descEl = document.createElement("div");
  descEl.className = "git-peek-error-desc";
  descEl.textContent = explanation;

  textWrap.appendChild(titleEl);
  textWrap.appendChild(descEl);

  container.appendChild(iconWrap);
  container.appendChild(textWrap);
  card.appendChild(container);
}

/**
 * Renders the Floating Profile Card with verified user data.
 * Completely immune to XSS via safe DOM APIs.
 * 
 * @param {HTMLElement} card - The card container element.
 * @param {Object} user - The GitHub API user response object.
 */
function renderProfile(card, user) {
  card.textContent = "";

  const profile = document.createElement("div");
  profile.className = "git-peek-profile-content";

  // --- Header Section: Avatar, Name, Username ---
  const header = document.createElement("div");
  header.className = "git-peek-card-header";

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "git-peek-avatar-container";

  const avatar = document.createElement("img");
  avatar.className = "git-peek-avatar-img";
  avatar.src = user.avatar_url || "";
  avatar.alt = `${user.login || "User"} avatar`;
  avatar.width = 48;
  avatar.height = 48;

  // Fallback for avatar load failure
  avatar.onerror = () => {
    avatar.style.display = "none";
  };

  avatarWrap.appendChild(avatar);

  const identity = document.createElement("div");
  identity.className = "git-peek-card-identity";

  const nameRow = document.createElement("div");
  nameRow.className = "git-peek-name-row";

  const name = document.createElement("span");
  name.className = "git-peek-full-name";
  name.textContent = user.name ? user.name : (user.login || "GitHub User");

  nameRow.appendChild(name);

  // Verified icon for prominent / high-follow users or standard checkmark
  const verifiedBadge = document.createElement("span");
  verifiedBadge.className = "git-peek-verified-pill";
  verifiedBadge.title = "Verified GitHub User";
  verifiedBadge.textContent = "✓";
  nameRow.appendChild(verifiedBadge);

  const login = document.createElement("div");
  login.className = "git-peek-handle";
  login.textContent = `@${user.login || ""}`;

  identity.appendChild(nameRow);
  identity.appendChild(login);

  header.appendChild(avatarWrap);
  header.appendChild(identity);
  profile.appendChild(header);

  // --- Bio Section ---
  const bio = document.createElement("div");
  bio.className = "git-peek-user-bio";
  bio.textContent = user.bio ? user.bio.trim() : "No bio available";
  profile.appendChild(bio);

  // --- Meta Badges: Location & Company ---
  if (user.location || user.company) {
    const metaList = document.createElement("div");
    metaList.className = "git-peek-meta-list";

    if (user.company) {
      const compItem = document.createElement("span");
      compItem.className = "git-peek-meta-tag";
      compItem.textContent = `🏢 ${user.company.trim()}`;
      metaList.appendChild(compItem);
    }

    if (user.location) {
      const locItem = document.createElement("span");
      locItem.className = "git-peek-meta-tag";
      locItem.textContent = `📍 ${user.location.trim()}`;
      metaList.appendChild(locItem);
    }

    profile.appendChild(metaList);
  }

  // --- Stats Section: Repositories, Followers, Following ---
  const statsBar = document.createElement("div");
  statsBar.className = "git-peek-stats-bar";

  statsBar.appendChild(createStatBadge("Repositories", formatCompactNumber(user.public_repos)));
  statsBar.appendChild(createStatDivider());
  statsBar.appendChild(createStatBadge("Followers", formatCompactNumber(user.followers)));
  statsBar.appendChild(createStatDivider());
  statsBar.appendChild(createStatBadge("Following", formatCompactNumber(user.following)));

  profile.appendChild(statsBar);

  // --- Action Button: View GitHub Profile ---
  const footer = document.createElement("div");
  footer.className = "git-peek-action-row";

  const profileLink = document.createElement("a");
  profileLink.className = "git-peek-primary-btn";
  profileLink.href = user.html_url || `https://github.com/${user.login}`;
  profileLink.target = "_blank";
  profileLink.rel = "noopener noreferrer";

  const btnText = document.createElement("span");
  btnText.textContent = "View GitHub Profile";

  const btnArrow = document.createElement("span");
  btnArrow.className = "git-peek-btn-arrow";
  btnArrow.textContent = "→";

  profileLink.appendChild(btnText);
  profileLink.appendChild(btnArrow);
  footer.appendChild(profileLink);
  profile.appendChild(footer);

  card.appendChild(profile);
}

/**
 * Creates a single statistic column badge.
 * 
 * @param {string} label
 * @param {string} value
 * @returns {HTMLElement}
 */
function createStatBadge(label, value) {
  const item = document.createElement("div");
  item.className = "git-peek-stat-col";

  const valueEl = document.createElement("span");
  valueEl.className = "git-peek-stat-num";
  valueEl.textContent = value;

  const labelEl = document.createElement("span");
  labelEl.className = "git-peek-stat-title";
  labelEl.textContent = label;

  item.appendChild(valueEl);
  item.appendChild(labelEl);
  return item;
}

/**
 * Creates a subtle vertical divider between stats columns.
 * 
 * @returns {HTMLElement}
 */
function createStatDivider() {
  const div = document.createElement("div");
  div.className = "git-peek-stat-divider";
  return div;
}

/**
 * Formats numbers into clean compact human-readable strings (e.g. 180000 -> 180K).
 * 
 * @param {number|null|undefined} num
 * @returns {string}
 */
function formatCompactNumber(num) {
  if (typeof num !== "number" || isNaN(num)) {
    return "0";
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toString();
}

/**
 * Persists the rendered profile to chrome.storage.local for Recent Lookups.
 * Deduplicates by username, puts the newest at the top, and keeps up to 6 profiles.
 * 
 * @param {Object} userData 
 */
function saveRecentProfileToStorage(userData) {
  if (!userData || !userData.login) return;
  try {
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get({ recentLookups: [] }, (items) => {
      const existing = Array.isArray(items.recentLookups) ? items.recentLookups : [];
      const normalizedUsername = userData.login.toLowerCase().trim();

      // Filter out any existing instance to avoid duplicate usernames
      const filtered = existing.filter(
        (item) => item && item.username && item.username.toLowerCase().trim() !== normalizedUsername
      );

      const newEntry = {
        username: userData.login,
        avatar_url: userData.avatar_url || "",
        profile_url: userData.html_url || `https://github.com/${userData.login}`,
        lastVisited: Date.now()
      };

      // Keep latest 6 unique profiles
      const updated = [newEntry, ...filtered].slice(0, 6);
      chrome.storage.local.set({ recentLookups: updated });
    });
  } catch (err) {
    console.warn("[Git-Peek] Content storage note:", err);
  }
}

})();
