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
      let url = 'https://userstyles.org' + path;
      if (queryParams) {
        url += '?' + queryParams;
      }
      const xhr = new XMLHttpRequest();
      xhr.timeout = TIMEOUT;
      xhr.onload = () => {
        if (xhr.status === 200 || url.protocol === 'file:') {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (err) {
            reject('Failed to parse JSON from ' + url + '\nJSON Text: ' + xhr.responseText);
          }
        } else {
          reject('Error code ' + xhr.status);
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

  return {load, next, prev}

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
            throw 'No results found';
          }
          currentPage = searchResults.current_page;
          updateSearchResultsNav(searchResults.current_page, searchResults.total_pages);
          searchResults.data.forEach(createSearchResult);
        })
        .catch(reason => {
          $('#load-search-results').classList.remove('hidden');
          $('#searchResults').classList.add('hidden');
          alert('Error while loading search results: ' + reason);
        });
    });
    return true;
  }

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
      id: ENTRY_ID_PREFIX_RAW + userstyleSearchResult.id,
      styleId: userstyleSearchResult.id
    });
    $('#searchResults-list').appendChild(entry);

    const title = $('.searchResult-title', entry);
    Object.assign(title, {
      textContent: userstyleSearchResult.name,
      title: userstyleSearchResult.name,
      href: 'https://userstyles.org' + userstyleSearchResult.url,
      onclick: handleEvent.openURLandHide
    });

    const screenshot = $('.searchResult-screenshot', entry);
    let ss_url = userstyleSearchResult.screenshot_url;
    if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(ss_url)) {
      ss_url = 'https://userstyles.org/style_screenshot_thumbnails/' + ss_url;
    }
    Object.assign(screenshot, {
      src: ss_url,
      title: userstyleSearchResult.name
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
    const name = userstyleSearchResult.name;
    Object.assign(installButton, {
      onclick: install
    });

    /** Installs the current userstyleSearchResult into stylus. */
    function install(event) {
      UserStylesAPI.fetch('/api/v1/styles/' + userstyleSearchResult.id)
        .then(styleObject => {
          console.log('TODO: Install style ID', userstyleSearchResult.id);
          console.log('Full styleObject:', styleObject);
          /*
           * FIXME
           * Sample full styleObject: https://userstyles.org/api/v1/styles/70271
           * We need to convert this sytleObject into the format expected by saveStyleSafe
           * I.e. styleObject.id is the ID of the userstyles.org style (e.g. 70271 above)
           */

          // messaging.js#saveStyleSafe({...}) expects an "id" referring to the Stylus ID (1-n).
          delete styleObject.id;

          Object.assign(styleObject, {
            // TODO: Massage styleObject into the format expected by saveStyleSafe
            enabled: true,
            reason: 'update',
            notify: true
          });
          saveStyleSafe(styleObject);
          alert('TODO: Install style ID #' + userstyleSearchResult.id + ' name "' + userstyleSearchResult.name + '"');
        })
        .catch(reason => {
          console.log('Error during installation:', reason);
          alert('Error installing style: ' + reason);
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
