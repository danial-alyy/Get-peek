/**
 * GIT-PEEK — Test Bench Script
 * 
 * Compliant with Manifest V3 Content Security Policy (CSP).
 * Handles interactive dynamic link injection on test.html.
 */

document.addEventListener("DOMContentLoaded", () => {
  const addLinkBtn = document.getElementById("add-link-btn");
  const dynamicContainer = document.getElementById("dynamic-container");

  if (addLinkBtn && dynamicContainer) {
    addLinkBtn.addEventListener("click", () => {
      // Create element safely
      const wrapper = document.createElement("div");
      wrapper.className = "test-link-wrap";

      const prefix = document.createTextNode("👉 Dynamically added link: ");
      
      const link = document.createElement("a");
      link.href = "https://github.com/gaearon";
      link.textContent = "https://github.com/gaearon";
      
      const suffix = document.createTextNode(" (Dan Abramov)");

      wrapper.appendChild(prefix);
      wrapper.appendChild(link);
      wrapper.appendChild(suffix);

      dynamicContainer.textContent = "";
      dynamicContainer.appendChild(wrapper);
    });
  }
});
