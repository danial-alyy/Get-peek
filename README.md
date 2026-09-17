# GIT-PEEK — Contextual GitHub Profile Viewer (PRO Edition)

> A commercial-grade, zero-dependency Google Chrome Extension built with **Manifest V3** that detects GitHub profile links across any webpage and presents a sleek, glassmorphic floating profile preview with real-time analytics.

---

## 🌟 What's New in the UI/UX Upgrade

- **Premium Extension Popup (`popup.html`):**
  - Polished commercial SaaS interface inspired by top-tier Chrome extensions.
  - Live pulse status pill (`● Extension Active` / `● Extension Paused`).
  - Interactive hero section featuring a miniature glassmorphic GitHub profile preview.
  - Real-time **Session Overview** tracking *Profiles Viewed*, *API Requests*, and *Cached Profiles* using `chrome.storage.local`.
  - Empty state onboarding banner: *"Ready to peek? Hover over any GitHub profile link to get started."*
  - 3-step Quick Guide and direct button to launch the built-in Test Bench.
- **Fluid Shimmer Skeleton Loader:**
  - Replaces basic loading text with an animated shimmer skeleton (avatar circle, text bars, and stats placeholders).
- **Glassmorphic Floating Profile Card:**
  - Modern dark glass aesthetic (`rgba(13, 17, 26, 0.96)`) with `backdrop-filter: blur(16px)`.
  - Multi-layered diffuse drop shadows and refined typography.
  - Verified user pill badges, formatted follower numbers (e.g. `180K`), and smooth hover micro-animations.
- **Refined Error States:**
  - Dedicated cards for *Profile not found*, *API limit reached*, and *Unable to load profile* with tailored SVG warning icons.
- **Redesigned Product Icons:**
  - High-resolution gradient eye and Git node motif (`#6366f1` to `#38bdf8`) across 16x16, 48x48, and 128x128.

---

## 📁 Project Structure

```text
git-peek/
├── manifest.json        # Manifest V3 configuration, action popup & permissions
├── background.js       # Service worker: API calls, Map() cache, storage metrics
├── content.js          # DOM injection: link detection, shimmer skeleton & card
├── style.css           # In-page hover card styling with shimmer keyframes
├── popup.html          # Extension popup UI
├── popup.css           # Modern SaaS stylesheet for popup dashboard
├── popup.js            # Popup controller for real-time stats & detection toggle
├── test.html           # Interactive dark-themed test bench
├── README.md           # Documentation and guide
└── icons/
    ├── icon16.png      # 16x16 toolbar icon
    ├── icon48.png      # 48x48 extensions manager icon
    └── icon128.png     # 128x128 store & installation icon
```

---

## 🛠️ Architecture & Data Flow

```text
+-------------------+                      +-----------------------+                      +--------------------+
|    Webpage DOM    |                      |      content.js       |                      |   background.js    |
+-------------------+                      +-----------------------+                      +--------------------+
          |                                            |                                             |
          | --- User hovers over <a> 500ms ----------> |                                             |
          |                                            | --- Injects Shimmer Skeleton UI             |
          |                                            | --- chrome.runtime.sendMessage(...) ------> |
          |                                            |     { action: "FETCH_GITHUB_USER",          |
          |                                            |       username: "torvalds" }                |
          |                                            |                                             | --- Checks toggle enabled
          |                                            |                                             | --- Increments profilesViewed
          |                                            |                                             | --- Checks Map() cache
          |                                            |                                             |     If hit: cachedProfiles++
          |                                            |                                             |     If miss: apiRequests++
          |                                            |                                             |              fetch() GitHub API
          |                                            | <--- sendResponse({ success, data }) ------ |
          | <--- Injects Glassmorphic Card ----------- |                                             |
```

---

## 📥 Chrome Installation Guide

1. Open Google Chrome and enter `chrome://extensions` in the address bar.
2. Toggle **Developer mode** in the top-right corner to **ON**.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `git-peek` folder:
   ```text
   C:\Users\Mr Shani\Downloads\git-peek
   ```
5. Pin **GIT-PEEK** to your Chrome toolbar for easy access to the popup dashboard.

---

## 🧪 Testing Checklist

Open `test.html` in Chrome (`Ctrl + O` -> `C:\Users\Mr Shani\Downloads\git-peek\test.html`):

1. **Hover & Skeleton:** Hover over `https://github.com/torvalds` for 500ms. Notice the shimmer skeleton during fetch, followed by Linus Torvalds' profile card.
2. **Real-time Analytics:** Click the **GIT-PEEK toolbar icon**. Check that *Profiles Viewed* and *API Requests* have incremented.
3. **Caching:** Hover over `https://github.com/torvalds` again. The card renders immediately. Check the popup: *Cached Profiles* has incremented!
4. **404 Handling:** Hover over the non-existent user link. A clean *"Profile not found"* error card appears.
5. **Detection Toggle:** Open the popup and toggle detection to **Paused**. Hover over any GitHub link—detection is smoothly disabled without errors. Toggle back to **Active** to resume.
