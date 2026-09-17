/**
 * GIT-PEEK — Background Service Worker (Manifest V3)
 * 
 * Handles GitHub REST API requests, in-memory caching,
 * extension toggle state, and metric analytics via chrome.storage.local.
 */

// In-memory cache using Map()
// Key: lowercase username, Value: { data: Object, timestamp: number }
const profileCache = new Map();

// Cache expiration time: 10 minutes in milliseconds
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Safely increments a numerical statistic in chrome.storage.local
 * 
 * @param {string} key - Name of the metric to increment.
 */
function incrementMetric(key) {
  try {
    chrome.storage.local.get({ [key]: 0 }, (items) => {
      const current = items[key] || 0;
      chrome.storage.local.set({ [key]: current + 1 });
    });
  } catch (err) {
    console.error("[Git-Peek] Error updating metrics:", err);
  }
}

/**
 * Records a profile to recent lookups in chrome.storage.local.
 * Keeps up to 6 unique entries with the most recent first.
 * Returns a Promise that resolves when storage is fully written.
 * 
 * @param {Object} userData - The GitHub user object.
 * @returns {Promise<Array>}
 */
function recordRecentLookup(userData) {
  if (!userData || !userData.login) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ recentLookups: [] }, (items) => {
        const existing = Array.isArray(items.recentLookups) ? items.recentLookups : [];
        const normalizedUsername = userData.login.toLowerCase().trim();

        // Remove existing entry for this user to prevent duplicates
        const filtered = existing.filter(
          (item) => item && item.username && item.username.toLowerCase().trim() !== normalizedUsername
        );

        const newEntry = {
          username: userData.login,
          avatar_url: userData.avatar_url || "",
          profile_url: userData.html_url || `https://github.com/${userData.login}`,
          lastVisited: Date.now()
        };

        // Keep latest 6 profiles
        const updated = [newEntry, ...filtered].slice(0, 6);
        chrome.storage.local.set({ recentLookups: updated }, () => {
          console.log(`[Git-Peek] Stored @${userData.login} in recentLookups. Count: ${updated.length}`);
          resolve(updated);
        });
      });
    } catch (err) {
      console.error("[Git-Peek] Error saving recent lookup:", err);
      resolve(null);
    }
  });
}

/**
 * Records a unique profile view for the current session.
 * Increments profilesViewed ONLY if the username has not been viewed yet in this session.
 * 
 * @param {string} login - GitHub username
 * @returns {Promise<number>} - Current session unique profile count
 */
function recordUniqueProfileView(login) {
  if (!login) return Promise.resolve(0);
  const normalized = login.toLowerCase().trim();

  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ sessionProfiles: [], profilesViewed: 0 }, (items) => {
        const sessionList = Array.isArray(items.sessionProfiles) ? [...items.sessionProfiles] : [];
        if (!sessionList.includes(normalized)) {
          sessionList.push(normalized);
          chrome.storage.local.set({
            sessionProfiles: sessionList,
            profilesViewed: sessionList.length
          }, () => {
            console.log(`[Git-Peek] Unique session profile viewed: @${normalized}. Total: ${sessionList.length}`);
            resolve(sessionList.length);
          });
        } else {
          resolve(sessionList.length);
        }
      });
    } catch (err) {
      console.error("[Git-Peek] Error recording unique profile view:", err);
      resolve(0);
    }
  });
}

/**
 * Listens for messages sent from content.js
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "FETCH_GITHUB_USER") {
    const username = request.username;

    // Validate username input before fetching
    if (!username || typeof username !== "string") {
      sendResponse({
        success: false,
        errorType: "INVALID_USERNAME",
        message: "Invalid GitHub username provided."
      });
      return false;
    }

    // Check if extension is enabled
    chrome.storage.local.get({ enabled: true }, async (settings) => {
      if (!settings.enabled) {
        sendResponse({
          success: false,
          errorType: "PAUSED",
          message: "Git-Peek detection is paused."
        });
        return;
      }

      const normalizedKey = username.toLowerCase().trim();

      // Check if valid cached data exists
      if (profileCache.has(normalizedKey)) {
        const cachedEntry = profileCache.get(normalizedKey);
        const isExpired = Date.now() - cachedEntry.timestamp > CACHE_TTL_MS;

        if (!isExpired) {
          console.log(`[Git-Peek] Serving @${username} from in-memory cache.`);
          incrementMetric("cachedProfiles");
          // Ensure recent lookups and session profile count are updated
          await recordRecentLookup(cachedEntry.data);
          await recordUniqueProfileView(cachedEntry.data.login);
          sendResponse({
            success: true,
            data: cachedEntry.data,
            fromCache: true
          });
          return;
        } else {
          // Remove expired entry from cache
          profileCache.delete(normalizedKey);
        }
      }

      // Track external API request
      incrementMetric("apiRequests");

      // Perform asynchronous API fetch
      fetchGitHubUserProfile(normalizedKey)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          console.error("[Git-Peek] Unexpected error in fetch handler:", error);
          sendResponse({
            success: false,
            errorType: "NETWORK_ERROR",
            message: "Unable to load GitHub profile."
          });
        });
    });

    // Return true to inform Chrome that sendResponse will be called asynchronously
    return true;
  }
});

/**
 * Fetches user profile data from the public GitHub REST API.
 * 
 * @param {string} username - The sanitized GitHub username.
 * @returns {Promise<Object>} Formatted response object for the content script.
 */
async function fetchGitHubUserProfile(username) {
  const endpoint = `https://api.github.com/users/${encodeURIComponent(username)}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "application/vnd.github.v3+json"
      }
    });

    // Handle HTTP 200 OK
    if (response.ok) {
      const userData = await response.json();

      // Store successful result in cache with current timestamp
      profileCache.set(username, {
        data: userData,
        timestamp: Date.now()
      });

      // Await recording to recent lookups history and unique session view
      await recordRecentLookup(userData);
      await recordUniqueProfileView(userData.login);

      return {
        success: true,
        data: userData,
        fromCache: false
      };
    }

    // Handle HTTP 404 User Not Found
    if (response.status === 404) {
      return {
        success: false,
        errorType: "NOT_FOUND",
        message: "Profile not found",
        explanation: "We couldn't find this GitHub profile."
      };
    }

    // Handle HTTP 403 or 429 Rate Limiting
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 429 || (response.status === 403 && rateLimitRemaining === "0")) {
      return {
        success: false,
        errorType: "RATE_LIMIT",
        message: "API limit reached",
        explanation: "Please try again later."
      };
    }

    // Handle any other HTTP errors (e.g. 500, 503)
    return {
      success: false,
      errorType: "HTTP_ERROR",
      message: "Unable to load profile",
      explanation: "GitHub service returned an unexpected response."
    };

  } catch (networkError) {
    console.error(`[Git-Peek] Network error fetching user ${username}:`, networkError);
    return {
      success: false,
      errorType: "NETWORK_ERROR",
      message: "Unable to load profile",
      explanation: "Check your network connection and try again."
    };
  }
}
