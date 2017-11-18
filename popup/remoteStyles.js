'use strict';

let currentPage = 1;

/**
 * Fetches and parses search results (in JSON) from userstyles.org
 * @return {Object} Search results from userstyles.org
 * @param {string} queryParams Query parameters to send in search request.
 */
function fetchSearchResults(queryParams) {
  return new Promise(function(resolve, reject) {
    const TIMEOUT = 10000;
    const headers = {
      'Content-type': 'application/json',
      'Accept': '*/*'
    };
    const url = 'https://userstyles.org/api/v1/styles/search?' + queryParams;
    console.log("fetchSearchResults url:", url);
    const xhr = new XMLHttpRequest();
    xhr.timeout = TIMEOUT;
    xhr.onload = () => (xhr.status === 200 || url.protocol === 'file:'
      ? resolve(JSON.parse(xhr.responseText))
      : reject(xhr.status));
    xhr.onerror = reject;
    xhr.open('GET', url, true);
    for (const key of Object.keys(headers)) {
      xhr.setRequestHeader(key, headers[key]);
    }
    xhr.send();
  });
}

function createSearchResultElement(searchResult) {
  /*
    searchResult format:
    {
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
  console.log("createSearchResultElement searchResult:", searchResult);

  const entry = template.searchResult.cloneNode(true);
  Object.assign(entry, {
    id: ENTRY_ID_PREFIX_RAW + searchResult.id,
    styleId: searchResult.id
  });
  console.log("createSearchResultElement entry:", entry);

  const title = $('.searchResult-title', entry);
  Object.assign(title, {
    textContent: searchResult.name,
    title: searchResult.name,
    href: searchResult.url
  });

  const screenshot = $('.searchResult-screenshot', entry);
  let ss_url = searchResult.screenshot_url;
  if (RegExp(/^[0-9]*_after.png$/i).test(ss_url)) {
    ss_url = 'https://userstyles.org/style_screenshot_thumbnails/' + ss_url;
  }
  Object.assign(screenshot, {
    src: ss_url,
    title: 'Screenshot of ' + searchResult.name
  });

  const description = $('.searchResult-description', entry);
  Object.assign(description, {
    innerHTML: searchResult.description,
    title: searchResult.description,
  });

  const authorLink = $('.searchResult-authorLink', entry);
  Object.assign(authorLink, {
    textContent: searchResult.user.name,
    title: searchResult.user.name,
    href: 'https://userstyles.org/users/' + searchResult.user.id
  });

  $('#searchResults').appendChild(entry);
}

function updateSearchResultsNav(currentPage, totalPages) {
    // Update 'next' button
    if (currentPage >= searchResults.total_pages) {
      currentPage = searchResults.total_pages;
      $('#searchResultsNav-next').classList.add("disabled");
    } else {
      $('#searchResultsNav-next').classList.remove("disabled");
    }

    // Update 'prev' button
    if (currentPage <= 1) {
      currentPage = 1;
      $('#searchResultsNav-prev').classList.add("disabled");
    } else {
      $('#searchResultsNav-prev').classList.remove("disabled");
    }
    $('#searchResultsNav-currentPage').textContent = currentPage;
    $('#searchResultsNav-totalPages').textContent = searchResults.total_pages;
}

function insertRemoteStyles(searchResults) {
  /*
    searchResults: {
      data: [...],
      current_page: 1,
      per_page: 15;
      total_pages: 6,
      total_entries: 85
    }
  */
  console.log("insertRemoteStyles(searchResults):", searchResults);
  currentPage = searchResults.current_page;
  updateSearchResultsNav(searchResults.current_page, searchResults.total_pages);
  searchResults.data.forEach((searchResult) => {
    console.log("searchResult:", searchResult);
    createSearchResultElement(searchResult);
  });
}

function loadRemoteStyles(event) {
  event.preventDefault();
  getActiveTab().then(tab => {
    console.log("tab.url:", tab.url);

    const url = new URL(tab.url);
    console.log("url:", url);

    const hostname = url.hostname;
    console.log("hostname:", hostname);

    const queryParams = [
      "search=" + encodeURIComponent(hostname),
      "page=" + currentPage,
      "per_page=3"
    ].join("&");

    fetchSearchResults(queryParams)
      .then(insertRemoteStyles)
      .catch(reason => {
        throw reason;
      });
  });
  return false;
}

function initRemoteStyles() {
  $('#load-remote-styles-link').onclick = loadRemoteStyles;
}

onDOMready().then(() => {
  initRemoteStyles();
});
