/**
 * GIT-PEEK PRO — Popup Logic
 * 
 * Handles real-time recent lookups display, click navigation to GitHub profiles,
 * dynamic counter badge, guide page launcher, and the extension active toggle.
 */

document.addEventListener("DOMContentLoaded", () => {
  const toggleInput = document.getElementById("detection-toggle");
  const headerPill = document.getElementById("header-status-pill");
  const headerStatusText = document.getElementById("header-status-text");
  const statusCard = document.getElementById("status-card");
  const statusCardTitle = document.getElementById("status-card-title");
  const statusCardDesc = document.getElementById("status-card-desc");
  const openTestBtn = document.getElementById("open-test-btn");
  const openGuideBtn = document.getElementById("open-guide-btn");

  const recentList = document.getElementById("recent-list");
  const recentEmpty = document.getElementById("recent-empty");
  const clearRecentBtn = document.getElementById("clear-recent-btn");
  const recentCounter = document.getElementById("recent-counter");

  const statProfilesViewed = document.getElementById("stat-profiles-viewed");
  const statApiRequests = document.getElementById("stat-api-requests");
  const statCachedProfiles = document.getElementById("stat-cached-profiles");
  const resetStatsBtn = document.getElementById("reset-stats-btn");

  // Load initial settings, recent lookups, and session stats from chrome.storage.local
  chrome.storage.local.get(
    {
      enabled: true,
      recentLookups: [],
      profilesViewed: 0,
      apiRequests: 0,
      cachedProfiles: 0
    },
    (items) => {
      updateToggleUI(items.enabled);
      renderRecentLookups(items.recentLookups || []);
      updateStatsUI(items.profilesViewed, items.apiRequests, items.cachedProfiles);
    }
  );

  // Toggle extension detection on / off
  toggleInput.addEventListener("change", () => {
    const isEnabled = toggleInput.checked;
    chrome.storage.local.set({ enabled: isEnabled }, () => {
      updateToggleUI(isEnabled);
    });
  });

  // Clear recent lookups only (preserves session statistics)
  clearRecentBtn.addEventListener("click", () => {
    chrome.storage.local.set({ recentLookups: [] }, () => {
      renderRecentLookups([]);
    });
  });

  // Reset session statistics only (preserves recent lookups history)
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener("click", () => {
      chrome.storage.local.set(
        {
          profilesViewed: 0,
          apiRequests: 0,
          cachedProfiles: 0,
          sessionProfiles: []
        },
        () => {
          updateStatsUI(0, 0, 0);
        }
      );
    });
  }

  // Open the built-in test bench in a new tab
  openTestBtn.addEventListener("click", () => {
    const testUrl = chrome.runtime.getURL("test.html");
    chrome.tabs.create({ url: testUrl });
  });

  // Open the Guide page in a new tab
  if (openGuideBtn) {
    openGuideBtn.addEventListener("click", () => {
      const guideUrl = chrome.runtime.getURL("guide.html");
      chrome.tabs.create({ url: guideUrl });
    });
  }

  // Listen for storage changes in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.enabled !== undefined) {
        updateToggleUI(changes.enabled.newValue);
      }
      if (changes.recentLookups !== undefined) {
        renderRecentLookups(changes.recentLookups.newValue || []);
      }
      if (
        changes.profilesViewed !== undefined ||
        changes.apiRequests !== undefined ||
        changes.cachedProfiles !== undefined
      ) {
        chrome.storage.local.get(
          {
            profilesViewed: 0,
            apiRequests: 0,
            cachedProfiles: 0
          },
          (items) => {
            updateStatsUI(items.profilesViewed, items.apiRequests, items.cachedProfiles);
          }
        );
      }
    }
  });

  /**
   * Updates the 3-column Session Overview statistics UI.
   * 
   * @param {number} viewed - Total unique profiles viewed this session
   * @param {number} api - Direct GitHub API requests
   * @param {number} cached - Profiles served from cache
   */
  function updateStatsUI(viewed, api, cached) {
    if (statProfilesViewed) {
      statProfilesViewed.textContent = (viewed || 0).toString();
    }
    if (statApiRequests) {
      statApiRequests.textContent = (api || 0).toString();
    }
    if (statCachedProfiles) {
      statCachedProfiles.textContent = (cached || 0).toString();
    }
  }

  /**
   * Updates toggle button and status card UI elements.
   * 
   * @param {boolean} isEnabled
   */
  function updateToggleUI(isEnabled) {
    toggleInput.checked = isEnabled;

    if (isEnabled) {
      headerPill.classList.remove("paused");
      headerStatusText.textContent = "Active";

      statusCard.classList.remove("paused");
      if (statusCardTitle) statusCardTitle.textContent = "Extension Active";
      if (statusCardDesc) statusCardDesc.textContent = "GitHub profile detection is enabled.";
    } else {
      headerPill.classList.add("paused");
      headerStatusText.textContent = "Paused";

      statusCard.classList.add("paused");
      if (statusCardTitle) statusCardTitle.textContent = "Extension Paused";
      if (statusCardDesc) statusCardDesc.textContent = "GitHub profile detection is paused.";
    }
  }

  /**
   * Renders the Recent Lookups list.
   * Reads persistent profile data from chrome.storage.local.
   * Updates the counter badge dynamically with the number of unique stored profiles.
   * 
   * @param {Array<Object>} lookups - Array of { username, avatar_url, profile_url, lastVisited }
   */
  function renderRecentLookups(lookups) {
    recentList.textContent = "";

    const validProfiles = Array.isArray(lookups)
      ? lookups.filter((item) => item && item.username)
      : [];

    // Show up to 6 unique profiles
    const displayList = validProfiles.slice(0, 6);

    // Update dynamic counter badge
    if (recentCounter) {
      recentCounter.textContent = displayList.length.toString();
    }

    if (displayList.length === 0) {
      recentEmpty.style.display = "block";
      clearRecentBtn.style.display = "none";
      return;
    }

    recentEmpty.style.display = "none";
    clearRecentBtn.style.display = "inline-block";

    displayList.forEach((profile) => {
      const row = document.createElement("div");
      row.className = "recent-item";
      row.title = `Open @${profile.username} on GitHub`;

      // Avatar container
      const avatarWrap = document.createElement("div");
      avatarWrap.className = "recent-avatar-wrap";

      const avatar = document.createElement("img");
      avatar.className = "recent-avatar";
      avatar.src = profile.avatar_url || "icons/icon48.png";
      avatar.alt = `@${profile.username}`;
      avatar.width = 32;
      avatar.height = 32;

      // Safe fallback on avatar loading error
      avatar.addEventListener("error", () => {
        avatar.src = "icons/icon48.png";
      });

      avatarWrap.appendChild(avatar);

      // Username text
      const username = document.createElement("span");
      username.className = "recent-username";
      username.textContent = `@${profile.username}`;

      // Small right arrow / chevron
      const chevron = document.createElement("span");
      chevron.className = "recent-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

      // Click to open profile in a new tab
      row.addEventListener("click", () => {
        const targetUrl = profile.profile_url || `https://github.com/${profile.username}`;
        chrome.tabs.create({ url: targetUrl });
      });

      row.appendChild(avatarWrap);
      row.appendChild(username);
      row.appendChild(chevron);
      recentList.appendChild(row);
    });
  }
});
