/* global handleEvent tryJSONparse */
'use strict';

/**
 * Library for interacting with userstyles.org
 * @returns {Object} Includes fetch() method which promises userstyles.org resources.
 */
const UserStylesAPI = (() => {
  return {fetch};

  /**
   * Fetches (and JSON-parses) the result from a userstyles.org API
   * @param {string} path Path on userstyles.org (e.g. '/api/v1/styles/search')
   * @param {string} queryParams Query parameters to send in search request (e.g. 'key=value&name=that)'.
   * @return {Object} Response object from userstyles.org
   */
  function fetch(path, queryParams) {
    return new Promise(function (resolve, reject) {
      const TIMEOUT = 10000;
      const headers = {
        'Content-type': 'application/json',
        'Accept': '*/*'
      };

      const url = new URL('https://userstyles.org');
      url.pathname = path;
      if (queryParams) {
        url.search = '?' + queryParams;
      }
      const xhr = new XMLHttpRequest();
      xhr.timeout = TIMEOUT;
      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(tryJSONparse(xhr.responseText));
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
})();

/**
 * Represents the search results within the Stylus popup.
 * @returns {Object} Includes load(), next(), and prev() methods to alter the search results.
 */
const SearchResults = (() => {
  let currentPage = 1;

  return {load, next, prev};

  /** Increments currentPage and loads results. */
  function next(event) {
    currentPage += 1;
    return load(event);
  }

  /** Decrements currentPage and loads results. */
  function prev(event) {
    currentPage = Math.max(1, currentPage - 1);
    return load(event);
  }

  /**
   * Display error message to user.
   * @param {string} message  Message to display to user.
   */
  function error(reason) {
    let message;
    if (reason === 404) {
      // TODO: i18n message
      message = 'No results found';
    } else {
      console.log('Error loading search results: ' + reason);
      message = 'Error loading search results: ' + reason;
    }
    $('#searchResults').classList.add('hidden');
    $('#searchResults-error').innerHTML = message;
    $('#searchResults-error').classList.remove('hidden');
  }

  /**
   * Loads search result for the (page number is currentPage).
   * @param {Object} event The click event
   */
  function load(event) {
    if (event) event.preventDefault();
    // Clear search results
    $('#searchResults-list').innerHTML = '';
    // Find styles for the current active tab
    getActiveTab().then(tab => {
      $('#load-search-results').classList.add('hidden');
      $('#searchResults').classList.remove('hidden');
      $('#searchResults-error').classList.add('hidden');

      const hostname = new URL(tab.url).hostname.replace(/^(?:.*\.)?([^.]*\.(co\.)?[^.]*)$/i, '$1');
      $('#searchResults-terms').textContent = hostname;

      const queryParams = [
        'search=' + encodeURIComponent(hostname),
        'page=' + currentPage,
        'per_page=3'
      ].join('&');

      UserStylesAPI.fetch('/api/v1/styles/search', queryParams)
        .then(searchResults => {
          /*
            searchResults: {
              data: [...],
              current_page: 1,
              per_page: 15;
              total_pages: 6,
              total_entries: 85
            }
          */
          if (searchResults.data.length === 0) {
            throw 404;
          }
          currentPage = searchResults.current_page;
          updateSearchResultsNav(searchResults.current_page, searchResults.total_pages);
          searchResults.data.forEach(createSearchResult);
        })
        .catch(error);
      });
    return true;
  }

  /** Updates prev/next buttons and currentPage/totalPage labels. */
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

  /**
   * Constructs and adds the given search result to the popup's Search Results container.
   * @param {Object} userstyleSearchResult The SearchResult object from userstyles.org
   */
  function createSearchResult(userstyleSearchResult) {
    /*
      userstyleSearchResult format: {
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

    // TODO: Check if search result is already installed.
    //       If so hide it, or mark as installed with an "Uninstall" button.

    const entry = template.searchResult.cloneNode(true);
    Object.assign(entry, {
      styleId: userstyleSearchResult.id
    });
    $('#searchResults-list').appendChild(entry);

    const searchResultName = userstyleSearchResult.name;
    const title = $('.searchResult-title', entry);
    Object.assign(title, {
      textContent: searchResultName,
      title: searchResultName,
      href: 'https://userstyles.org' + userstyleSearchResult.url,
      onclick: handleEvent.openURLandHide
    });

    const screenshot = $('.searchResult-screenshot', entry);
    let screenshotUrl = userstyleSearchResult.screenshot_url;
    if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(screenshotUrl)) {
      screenshotUrl = 'https://userstyles.org/style_screenshot_thumbnails/' + screenshotUrl;
    }
    Object.assign(screenshot, {
      src: screenshotUrl,
      title: searchResultName
    });

    // TODO: Expand/collapse description
    const description = $('.searchResult-description', entry);
    Object.assign(description, {
      textContent: userstyleSearchResult.description.replace(/<.*?>/g, ''),
      title: userstyleSearchResult.description.replace(/<.*?>/g, '')
    });

    const authorLink = $('.searchResult-authorLink', entry);
    Object.assign(authorLink, {
      textContent: userstyleSearchResult.user.name,
      title: userstyleSearchResult.user.name,
      href: 'https://userstyles.org/users/' + userstyleSearchResult.user.id,
      onclick: handleEvent.openURLandHide
    });

    // TODO: Total & Weekly Install Counts
    // TODO: Rating

    const installButton = $('.searchResult-install', entry);
    installButton.onclick = install;

    /** Installs the current userstyleSearchResult into stylus. */
    function install() {
      // TODO: Detect if style has customizations, point to style page if so.
      const styleId = userstyleSearchResult.id;
      const url = 'https://userstyles.org/styles/chrome/' + styleId + '.json';
      download(url)
        .then(responseText => {
          saveStyleSafe(tryJSONparse(responseText));
          installButton.disabled = 'disabled';
          installButton.textContent = 'Installed';
        })
        .catch(reason => {
          console.log('Error while installing from ' + url + ': ' + reason);
          alert('Error while installing from ' + url + ': ' + reason);
        });
      return true;
    }
  }
})();

onDOMready().then(() => {
  $('#load-search-results-link').onclick = SearchResults.load;
  $('#searchResultsNav-prev').onclick = SearchResults.prev;
  $('#searchResultsNav-next').onclick = SearchResults.next;
});
