'use strict';

let currentPage = 1;
let hostname;

/**
 * Fetches JSON object from userstyles.org API
 * @param {string} path Path on userstyles.org (e.g. /api/v1/styles)
 * @param {string} queryParams Query parameters to send in search request.
 * @return {Object} API response object from userstyles.org
 */
function fetchUserstylesAPI(path, queryParams) {
  return new Promise(function(resolve, reject) {
    const TIMEOUT = 10000;
    const headers = {
      'Content-type': 'application/json',
      'Accept': '*/*'
    };
    let url = 'https://userstyles.org' + path;
    if (queryParams) {
      url += "?" + queryParams;
    }
    const xhr = new XMLHttpRequest();
    xhr.timeout = TIMEOUT;
    xhr.onload = () => {
      if (xhr.status === 200 || url.protocol === 'file:') {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject("Failed to parse JSON from " + url + "\nJSON Text: " + xhr.responseText);
        }
      } else {
        reject(xhr.status);
      }
    };
    xhr.onerror = reject;
    xhr.open('GET', url, true);
    for (const key of Object.keys(headers)) {
      xhr.setRequestHeader(key, headers[key]);
    }
    xhr.send();
  });
}

/**
 * Adds an entry to the Search Results DOM
 * @param {Object} searchResult The JSON object from userstyles.org representing a search result.
 */
function createSearchResultElement(searchResult) {
  /*
    searchResult format: {
      id: 100835,
      name: "Reddit Flat Dark",
      screenshot_url: "19339_after.png",
      description: "...",
      user: {
        id: 48470,
        name: "holloh"
      }
    }
  */
  const entry = template.searchResult.cloneNode(true);
  Object.assign(entry, {
    id: ENTRY_ID_PREFIX_RAW + searchResult.id,
    styleId: searchResult.id
  });

  const title = $('.searchResult-title', entry);
  Object.assign(title, {
    textContent: searchResult.name,
    title: searchResult.name,
    href: 'https://userstyles.org' + searchResult.url,
    onclick: handleEvent.openURLandHide
  });

  const screenshot = $('.searchResult-screenshot', entry);
  let ss_url = searchResult.screenshot_url;
  if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(ss_url)) {
    ss_url = 'https://userstyles.org/style_screenshot_thumbnails/' + ss_url;
  }
  Object.assign(screenshot, {
    src: ss_url,
    title: searchResult.name
  });

  // TODO: Expand/collapse description
  const description = $('.searchResult-description', entry);
  Object.assign(description, {
    textContent: searchResult.description.replace(/<.*?>/g, ""),
    title: searchResult.description.replace(/<.*?>/g, "")
  });

  const authorLink = $('.searchResult-authorLink', entry);
  Object.assign(authorLink, {
    textContent: searchResult.user.name,
    title: searchResult.user.name,
    href: 'https://userstyles.org/users/' + searchResult.user.id,
    onclick: handleEvent.openURLandHide
  });

  // TODO: Total & Weekly Install Counts
  // TODO: Rating

  const install = $('.searchResult-install', entry);
  const name = searchResult.name;
  Object.assign(install, {
    onclick: (event) => {
      event.preventDefault();
      // TODO: Install style
      fetchUserstylesAPI("/api/v1/styles/" + searchResult.id)
        .then( styleObject => {
          console.log("TODO: Install style ID", searchResult.id);
          console.log("Full styleObject:", styleObject);
          alert("TODO: Install style ID #" + searchResult.id + " name '" + searchResult.name + "'");
        })
        .catch(reason => {
          throw reason;
        });
      return true;
    }
  });

  $('#searchResults-list').appendChild(entry);
}

function updateSearchResultsNav(currentPage, totalPages) {
    // Update 'next' button
    if (currentPage >= totalPages) {
      currentPage = totalPages;
      $('#searchResultsNav-next').setAttribute('disabled', 'disabled');
    } else {
      $('#searchResultsNav-next').removeAttribute('disabled');
    }

    // Update 'prev' button
    if (currentPage <= 1) {
      currentPage = 1;
      $('#searchResultsNav-prev').setAttribute('disabled', 'disabled');
    } else {
      $('#searchResultsNav-prev').removeAttribute('disabled');
    }

    // Update current/total counts
    $('#searchResultsNav-currentPage').textContent = currentPage;
    $('#searchResultsNav-totalPages').textContent = totalPages;
}

function processSearchResults(searchResults) {
  /*
    searchResults: {
      data: [...],
      current_page: 1,
      per_page: 15;
      total_pages: 6,
      total_entries: 85
    }
  */
  currentPage = searchResults.current_page;
  updateSearchResultsNav(searchResults.current_page, searchResults.total_pages);
  searchResults.data.forEach(createSearchResultElement);
}

function loadNextPage(event) {
  currentPage += 1;
  loadSearchResults(event);
}

function loadPrevPage(event) {
  currentPage = Math.max(1, currentPage - 1);
  loadSearchResults(event);
}

function loadSearchResults(event) {
  event.preventDefault();
  // Clear search results
  $('#searchResults-list').innerHTML = "";
  // Find styles for the current active tab
  getActiveTab().then(tab => {
    hostname = new URL(tab.url).hostname;
    const queryParams = [
      'search=' + encodeURIComponent(hostname),
      'page=' + currentPage,
      'per_page=3'
    ].join('&');

    // Hide load button
    $('#load-search-results').classList.add("hidden");

    // Display results container
    $('#searchResults').classList.remove("hidden");
    $('#searchResults-terms').textContent = hostname;

    fetchUserstylesAPI("/api/v1/styles/search", queryParams)
      .then(code => {
        processSearchResults(code);
      })
      .catch(reason => {
        throw reason;
      });
  });
  return false;
}

onDOMready().then(() => {
  $('#load-search-results-link').onclick = loadSearchResults;
  $('#searchResultsNav-prev').onclick = loadPrevPage;
  $('#searchResultsNav-next').onclick = loadNextPage;
});
