
//##################################################################
// EVERYDAY SAINTS
// SHARED NAVIGATION AND FOOTER SYSTEM
// V12
//##################################################################
//
// Purpose:
//
// Loads the shared top navigation and footer into each
// participating page.
//
// Components:
// - /shared/topnav.html
// - /shared/footernav.html
//
// Styling:
// - /shared/shared.css
//
// Requirements:
//
// Each participating page must contain:
//
// <div id="shared-topnav"></div>
// <div id="shared-footernav"></div>
//
// The shared stylesheet must be linked in the page's head.
//
// The title, branding, rotating logo, advertisements,
// and page-specific functionality remain independent.
//
//##################################################################


//==================================================================
// 01. LOAD SHARED COMPONENT
//==================================================================
//
// Retrieves an HTML component and inserts it into its
// designated placeholder.
//
//==================================================================

async function loadSharedComponent(elementId, filePath) {

  const container = document.getElementById(elementId);

  if (!container) {
    console.warn(
      "Shared component placeholder not found:",
      elementId
    );
    return false;
  }

  try {

    const response = await fetch(filePath);

    if (!response.ok) {
      throw new Error(
        "HTTP " + response.status
      );
    }

    container.innerHTML = await response.text();

    return true;

  } catch (error) {

    console.error(
      "Unable to load shared component:",
      filePath,
      error
    );

    return false;

  }

}


//==================================================================
// 02. INITIALIZE SHARED NAVIGATION
//==================================================================
//
// Activates the Topics button and Search field after
// the shared navigation HTML has been inserted.
//
// On informational pages, these controls redirect
// visitors to the homepage.
//
// The homepage can retain its own Topics and Search
// handlers.
//
//==================================================================

function initializeSharedNavigation() {

  const topicsButton =
    document.getElementById("topicsButton");

  const searchInput =
    document.getElementById("searchInput");

  const isHomepage =
    window.location.pathname === "/" ||
    window.location.pathname === "/index.html";


  //==============================================================
  // 02.1 TOPICS BUTTON
  //==============================================================

  if (topicsButton && !isHomepage) {

    topicsButton.addEventListener("click", function () {

      window.location.href =
        "/index.html?topics=open";

    });

  }


  //==============================================================
  // 02.2 SEARCH FIELD
  //==============================================================

  if (searchInput && !isHomepage) {

    searchInput.addEventListener(
      "keydown",
      function (event) {

        if (event.key !== "Enter") {
          return;
        }

        const searchTerm =
          searchInput.value.trim();

        if (!searchTerm) {
          return;
        }

        window.location.href =
          "/index.html?search=" +
          encodeURIComponent(searchTerm);

      }
    );

  }

}


//==================================================================
// 03. INITIALIZE SHARED COMPONENTS
//==================================================================
//
// Loads both components after the page's HTML is ready.
//
// Navigation functionality is initialized only after
// the navigation HTML has finished loading.
//
//==================================================================

async function initializeSharedComponents() {

  const navigationLoaded =
    await loadSharedComponent(
      "shared-topnav",
      "/shared/topnav.html"
    );

  if (navigationLoaded) {
    initializeSharedNavigation();
  }

  await loadSharedComponent(
    "shared-footernav",
    "/shared/footernav.html"
  );

}


//==================================================================
// 04. START SHARED SYSTEM
//==================================================================

if (document.readyState === "loading") {

  document.addEventListener(
    "DOMContentLoaded",
    initializeSharedComponents
  );

} else {

  initializeSharedComponents();

}


//==================================================================
// END SHARED SYSTEM
//==================================================================
