/**
 * GIT-PEEK PRO — Guide Page Script
 * 
 * Handles navigation to the test bench and GitHub.
 * Strictly compliant with Manifest V3 Content Security Policy.
 */

document.addEventListener("DOMContentLoaded", () => {
  const testBenchBtn = document.getElementById("test-bench-btn");
  const openGitHubBtn = document.getElementById("open-github-btn");

  if (testBenchBtn) {
    testBenchBtn.addEventListener("click", () => {
      const testUrl = chrome.runtime.getURL("test.html");
      chrome.tabs.create({ url: testUrl });
    });
  }

  if (openGitHubBtn) {
    openGitHubBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://github.com" });
    });
  }
});
