'use strict';

let currentPage = 1;
let hostname;

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
    console.log('fetchSearchResults url:', url);
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
  console.log('createSearchResultElement searchResult:', searchResult);

  const entry = template.searchResult.cloneNode(true);
  Object.assign(entry, {
    id: ENTRY_ID_PREFIX_RAW + searchResult.id,
    styleId: searchResult.id
  });
  console.log('createSearchResultElement entry:', entry);

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
    title: 'Screenshot of ' + searchResult.name
  });

  // TODO: Expand/collapse description
  const description = $('.searchResult-description', entry);
  Object.assign(description, {
    textContent: searchResult.description.replace(/<.*?>/g, ""),
    title: searchResult.description.replace(/<.*?>/g, ""),
  });

  const authorLink = $('.searchResult-authorLink', entry);
  Object.assign(authorLink, {
    textContent: searchResult.user.name,
    title: searchResult.user.name,
    href: 'https://userstyles.org/users/' + searchResult.user.id,
    onclick: handleEvent.openURLandHide
  });

  $('#searchResults').appendChild(entry);
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
    $('#searchResultsNav-currentPage').textContent = currentPage;
    $('#searchResultsNav-totalPages').textContent = totalPages;
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
  currentPage = searchResults.current_page;
  updateSearchResultsNav(searchResults.current_page, searchResults.total_pages);
  searchResults.data.forEach(createSearchResultElement);
}

function loadRemoteStyles(event) {
  event.preventDefault();
  getActiveTab().then(tab => {
    hostname = new URL(tab.url).hostname;
    const queryParams = [
      'search=' + encodeURIComponent(hostname),
      'page=' + currentPage,
      'per_page=3'
    ].join('&');

    $('#searchresults-terms').textContent = hostname;
    $('#remote-styles').classList.remove("hidden");
    $('#load-remote-styles').classList.add("hidden");
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
