/* global tabURL handleEvent */
'use strict';

window.addEventListener('showStyles:done', function _() {
  window.removeEventListener('showStyles:done', _);

  if (!tabURL) {
    return;
  }

  Object.assign($('#find-styles-link'), {
    href: searchUserstyles().getSearchPageURL(tabURL),
    onclick(event) {
      if (!prefs.get('popup.findStylesInline')) {
        handleEvent.openURLandHide.call(this, event);
        return;
      }

      $('#find-styles-inline-group').classList.add('hidden');

      const searchResults = searchResultsController();
      searchResults.init();
      searchResults.load();

      event.preventDefault();
    },
  });

  /**
   * Represents the search results within the Stylus popup.
   * @returns {Object} Includes load(), next(), and prev() methods to alter the search results.
   */
  function searchResultsController() {
    const DISPLAYED_RESULTS_PER_PAGE = 10; // Number of results to display in popup.html
    const DELAY_AFTER_FETCHING_STYLES = 0; // Millisecs to wait before fetching next batch of search results.
    const DELAY_BEFORE_SEARCHING_STYLES = 0; // Millisecs to wait before fetching .JSON for next search result.
    const searchAPI = searchUserstyles();
    const unprocessedResults = []; // Search results not yet processed.
    const processedResults = []; // Search results that are not installed and apply ot the page (includes 'json' field with full style).
    const BLANK_PIXEL_DATA = 'data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAA' +
                             'C1HAwCAAAAC0lEQVR42mOcXQ8AAbsBHLLDr5MAAAAASUVORK5CYII=';
    const UPDATE_URL = 'https://update.userstyles.org/%.md5';
    const ENTRY_ID_PREFIX = 'search-result-';

    let scrollToFirstResult = true;
    let loading = false;
    let category; // Category for the active tab's URL.
    let currentDisplayedPage = 1; // Current page number in popup.html

    return {init, load, next, prev};

    function init() {
      $('#search-results-nav-prev').onclick = prev;
      $('#search-results-nav-next').onclick = next;
      document.body.classList.add('search-results-shown');
      addEventListener('styleDeleted', ({detail}) => {
        const entries = [...$('#search-results-list').children];
        const entry = entries.find(el => el._result.installedStyleId === detail.id);
        if (entry) {
          entry._result.installed = false;
          renderActionButtons(entry);
        }
      });
    }

    /**
     * Sets loading status of search results.
     * @param {Boolean} isLoading If search results are idle (false) or still loading (true).
     */
    function setLoading(isLoading) {
      if (loading !== isLoading) {
        loading = isLoading;

        render(); // Refresh elements that depend on `loading` state.

        if (isLoading) {
          showSpinner('#search-results');
        } else {
          $.remove('#search-results > .lds-spinner');
        }
      }
    }

    function showSpinner(parent) {
      parent = parent instanceof Node ? parent : $(parent);
      parent.appendChild($create('.lds-spinner',
        new Array(12).fill($create('div')).map(e => e.cloneNode())));
    }

    function render() {
      let startIndex = (currentDisplayedPage - 1) * DISPLAYED_RESULTS_PER_PAGE;
      const endIndex = currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE;

      const list = $('#search-results-list');

      // keep rendered elements with ids in the range of interest
      for (let i = 0; i < DISPLAYED_RESULTS_PER_PAGE;) {
        const el = list.children[i];
        if (!el) {
          break;
        }
        if (el.id === 'search-result-' + (processedResults[startIndex] || {}).id) {
          startIndex++;
          i++;
        } else {
          el.remove();
        }
      }

      const displayedResults = processedResults.slice(startIndex, endIndex);
      displayedResults.forEach(createSearchResultNode);

      $('#search-results-nav-prev').disabled = (currentDisplayedPage <= 1 || loading);
      $('#search-results-nav-current-page').textContent = currentDisplayedPage;

      let totalResultsCount = processedResults.length;
      if (unprocessedResults.length > 0) {
        // Add 1 page if there's results left to process.
        totalResultsCount += DISPLAYED_RESULTS_PER_PAGE;
      }
      const totalPageCount = Math.ceil(Math.max(1, totalResultsCount / DISPLAYED_RESULTS_PER_PAGE));
      $('#search-results-nav-next').disabled = (currentDisplayedPage >= totalPageCount || loading);
      $('#search-results-nav-total-pages').textContent = totalPageCount;

      // Fill in remaining search results with blank results + spinners
      const maxResults = currentDisplayedPage < totalPageCount
        ? DISPLAYED_RESULTS_PER_PAGE
        : displayedResults.length + unprocessedResults.length;
      for (let i = list.children.length; i < maxResults; i++) {
        const entry = template.emptySearchResult.cloneNode(true);
        list.appendChild(entry);
        showSpinner(entry);
      }

      if (scrollToFirstResult && list.children[0]) {
        scrollToFirstResult = false;
        if (!FIREFOX || FIREFOX >= 55) {
          list.children[0].scrollIntoView({behavior: 'smooth', block: 'start'});
        }
      }
    }

    /**
     * @returns {Boolean} If we should process more results.
     */
    function shouldLoadMore() {
      return (processedResults.length < currentDisplayedPage * DISPLAYED_RESULTS_PER_PAGE);
    }

    function loadMoreIfNeeded() {
      if (shouldLoadMore()) {
        setTimeout(load, DELAY_BEFORE_SEARCHING_STYLES);
      }
    }

    /** Increments currentDisplayedPage and loads results. */
    function next() {
      currentDisplayedPage += 1;
      scrollToFirstResult = true;
      render();
      loadMoreIfNeeded();
    }

    /** Decrements currentPage and loads results. */
    function prev() {
      currentDisplayedPage = Math.max(1, currentDisplayedPage - 1);
      scrollToFirstResult = true;
      render();
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
        message = 'Error loading search results: ' + reason;
      }
      $('#search-results').classList.add('hidden');
      $('#search-results-error').textContent = message;
      $('#search-results-error').classList.remove('hidden');
    }

    /**
     * Initializes search results container, starts fetching results.
     */
    function load() {
      if (unprocessedResults.length > 0) {
        // Keep processing search results if there are any.
        processNextResult();
      } else if (searchAPI.isExhausted()) {
        // Stop if no more search results.
        if (processedResults.length === 0) {
          // No results
          error(404);
        }
      } else {
        setLoading(true);
        // Search for more results.
        $('#search-results').classList.remove('hidden');
        $('#search-results-error').classList.add('hidden');

        // Discover "category" for the URL, then search.
        category = searchAPI.getCategory(tabURL);
        searchAPI.search(category)
          .then(searchResults => {
            setLoading(false);
            if (searchResults.data.length === 0) {
              throw 404;
            }
            unprocessedResults.push(unprocessedResults, ...searchResults.data);
            processNextResult();
          })
          .catch(error);
      }
    }

    /**
     * Processes the next search result in `unprocessedResults` and adds to `processedResults`.
     * Skips installed/non-applicable styles.
     * Fetches more search results if unprocessedResults is empty.
     * Recurses until shouldLoadMore() is false.
     */
    function processNextResult() {
      if (!shouldLoadMore()) {
        return;
      }

      if (unprocessedResults.length === 0) {
        // No more results to process
        loadMoreIfNeeded();
        return;
      }

      // Process the next result in the queue.
      const nextResult = unprocessedResults.shift();
      getStylesSafe({md5Url: UPDATE_URL.replace('%', nextResult.id)})
        .then(([installedStyle]) => {
          if (installedStyle) {
            setTimeout(processNextResult);
            return;
          }
          if (nextResult.category !== 'site') {
            setTimeout(processNextResult);
            return;
          }
          // Style not installed.
          // Get "style_settings" (customizations)
          searchAPI.fetchStyle(nextResult.id)
            .then(userstyleObject => {
              // Store style settings for detecting customization later.
              nextResult.style_settings = userstyleObject.style_settings;
              processedResults.push(nextResult);
              render();
              setTimeout(processNextResult, DELAY_AFTER_FETCHING_STYLES);
            })
            .catch(reason => {
              console.log('processNextResult(', nextResult.id, ') => [ERROR]: ', reason);
              setTimeout(processNextResult, DELAY_AFTER_FETCHING_STYLES);
            });
        });
    }

    /**
     * Constructs and adds the given search result to the popup's Search Results container.
     * @param {Object} result The SearchResult object from userstyles.org
     */
    function createSearchResultNode(result) {
      /*
        userstyleSearchResult format: {
          id: 100835,
          name: "Reddit Flat Dark",
          screenshot_url: "19339_after.png",
          description: "...",
          user: {
            id: 48470,
            name: "holloh"
          },
          style_settings: [...]
        }
      */

      const entry = template.searchResult.cloneNode(true);
      Object.assign(entry, {
        _result: result,
        id: ENTRY_ID_PREFIX + result.id,
      });

      Object.assign($('.search-result-title', entry), {
        onclick: handleEvent.openURLandHide,
        href: searchAPI.BASE_URL + result.url
      });

      const displayedName = result.name.length < 300 ? result.name : result.name.slice(0, 300) + '...';
      $('.search-result-title span', entry).textContent = tWordBreak(displayedName);

      const screenshot = $('.search-result-screenshot', entry);
      let screenshotUrl = result.screenshot_url;
      if (screenshotUrl === null) {
        screenshotUrl = BLANK_PIXEL_DATA;
        screenshot.classList.add('no-screenshot');
      } else if (RegExp(/^[0-9]*_after.(jpe?g|png|gif)$/i).test(screenshotUrl)) {
        screenshotUrl = searchAPI.BASE_URL + '/style_screenshot_thumbnails/' + screenshotUrl;
      }
      screenshot.src = screenshotUrl;

      const description = result.description
        .replace(/<[^>]*>/g, '')
        .replace(/[\r\n]{3,}/g, '\n\n');
      Object.assign($('.search-result-description', entry), {
        textContent: description,
        title: description,
      });

      Object.assign($('.search-result-author-link', entry), {
        textContent: result.user.name,
        title: result.user.name,
        href: searchAPI.BASE_URL + '/users/' + result.user.id,
        onclick(event) {
          event.stopPropagation();
          handleEvent.openURLandHide.call(this, event);
        }
      });

      let ratingClass;
      let ratingValue = result.rating;
      if (ratingValue === null) {
        ratingClass = 'none';
        ratingValue = 'n/a';
      } else if (ratingValue >= 2.5) {
        ratingClass = 'good';
        ratingValue = ratingValue.toFixed(1);
      } else if (ratingValue >= 1.5) {
        ratingClass = 'okay';
        ratingValue = ratingValue.toFixed(1);
      } else {
        ratingClass = 'bad';
        ratingValue = ratingValue.toFixed(1);
      }
      Object.assign($('.search-result-rating', entry), {
        textContent: ratingValue,
        className: 'search-result-rating ' + ratingClass
      });

      Object.assign($('.search-result-install-count', entry), {
        textContent: result.total_install_count.toLocaleString()
      });
      renderActionButtons(entry);

      $('#search-results-list').appendChild(entry);
      return entry;
    }

    function renderActionButtons(entry) {
      const uninstallButton = $('.search-result-uninstall', entry);
      uninstallButton.onclick = onUninstallClicked;

      const installButton = $('.search-result-install', entry);
      installButton.onclick = onInstallClicked;

      const result = entry._result;
      if (result.style_settings.length > 0) {
        // Style has customizations
        installButton.classList.add('customize');
        uninstallButton.classList.add('customize');

        const customizeButton = $('.search-result-customize', entry);
        customizeButton.dataset.href = searchAPI.BASE_URL + result.url;
        customizeButton.dataset.sendMessage = JSON.stringify({method: 'openSettings'});
        customizeButton.classList.remove('hidden');
        customizeButton.onclick = function (event) {
          event.stopPropagation();
          handleEvent.openURLandHide.call(this, event);
        };
      }

      installButton.classList.toggle('hidden', Boolean(result.installed));
      uninstallButton.classList.toggle('hidden', !result.installed);
    }

    function onUninstallClicked(event) {
      event.stopPropagation();
      const entry = this.closest('.search-result');
      const result = entry._result;
      deleteStyleSafe({id: result.installedStyleId})
        .then(() => {
          entry._result.installed = false;
          renderActionButtons(entry);
        });
    }

    /** Installs the current userstyleSearchResult into Stylus. */
    function onInstallClicked(event) {
      event.stopPropagation();

      const entry = this.closest('.search-result');
      const result = entry._result;
      const installButton = $('.search-result-install', entry);

      showSpinner(entry);
      installButton.disabled = true;

      // Fetch .JSON style
      searchAPI.fetchStyleJson(result)
        .then(userstyleJson => {
          userstyleJson.reason = 'install';
          if (result.style_settings.length) {
            // this will make the popup show a config-on-homepage icon
            userstyleJson.updateUrl += '?';
          }
          // Install style
          saveStyleSafe(userstyleJson)
            .then(savedStyle => {
              // Success: Store installed styleId, mark as installed.
              result.installed = true;
              result.installedStyleId = savedStyle.id;
              renderActionButtons(entry);

              $.remove('.lds-spinner', entry);
              installButton.disabled = false;
            });
        })
        .catch(reason => {
          const usoId = result.id;
          console.log('install:saveStyleSafe(usoID:', usoId, ') => [ERROR]: ', reason);
          alert('Error while downloading usoID:' + usoId + '\nReason: ' + reason);

          $.remove('.lds-spinner', entry);
          installButton.disabled = false;
        });
      return true;
    }

  } // End of searchResultsController
});

/**
 * Library for interacting with userstyles.org
 * @returns {Object} Exposed methods representing the search results on userstyles.org
 */
function searchUserstyles() {
  const BASE_URL = 'https://userstyles.org';
  const CACHE_PREFIX = 'usoSearchCache';
  const CACHE_DURATION = 1 * 3600e3;
  let totalPages;
  let currentPage = 1;
  let exhausted = false;

  return {BASE_URL, getCategory, getSearchPageURL, isExhausted, search, fetchStyleJson, fetchStyle};

  /**
   * @returns {Boolean} If there are no more results to fetch from userstyles.org
   */
  function isExhausted() {
    return exhausted;
  }

  function getSearchPageURL(url) {
    const category = getCategory(url);
    if (category === 'STYLUS') {
      return BASE_URL + '/styles/browse/?search_terms=Stylus';
    } else {
      return BASE_URL + '/styles/browse/' + category;
    }
  }

  /**
   * Resolves the Userstyles.org "category" for a given URL.
   * @param {String} url The URL to a webpage.
   * @returns {Promise<String>} The category for a URL, or the hostname if category is not found.
   */
  function getCategory(url) {
    const u = tryCatch(() => new URL(url));
    if (!u) {
      return ''; // Invalid URL
    } else if (u.protocol === 'file:') {
      return 'file:'; // File page
    } else if (u.protocol === location.protocol) {
      return 'STYLUS'; // Stylus page
    } else {
      // Website address, strip TLD & subdomain
      let domain = u.hostname.replace(/^www\.|(\.com?)?\.\w+$/g, '').split('.').pop();
      if (domain === 'userstyles') {
        domain = 'userstyles.org';
      }
      return domain;
    }
  }

  /**
   * Fetches the JSON style object from userstyles.org (containing code, sections, updateUrl, etc).
   * Stores (caches) the JSON within the given usoSearchResult, to avoid unnecessary network usage.
   * Style JSON is fetched from the /styles/chrome/{id}.json endpoint.
   * @param {Object} usoSearchResult A search result object from userstyles.org
   * @returns {Promise<Object>} Promises the response as a JSON object.
   */
  function fetchStyleJson(usoSearchResult) {
    return new Promise((resolve, reject) => {
      if (usoSearchResult.json) {
        // JSON already downloaded & stored.
        resolve(usoSearchResult.json);
      }

      const jsonUrl = BASE_URL + '/styles/chrome/' + usoSearchResult.id + '.json';
      download(jsonUrl)
        .then(responseText => {
          // Store JSON within the search result, so we don't have to download again.
          usoSearchResult.json = tryJSONparse(responseText);
          resolve(usoSearchResult.json);
        })
        .catch(reject);
    });
  }

  /**
   * Fetches style information from userstyles.org's /api/v1/styles/{ID} API.
   * @param {number} userstylesId The internal "ID" for a style on userstyles.org
   * @returns {Promise<Object>} An object containing info about the style, e.g. name, author, etc.
   */
  function fetchStyle(userstylesId) {
    return readCache(userstylesId)
      .then(json => json ||
        download(BASE_URL + '/api/v1/styles/' + userstylesId, {
          method: 'GET',
          headers: {
            'Content-type': 'application/json',
            'Accept': '*/*'
          },
          responseType: 'json',
          body: null
        }).then(writeCache));
  }

  /**
   * Fetches (and JSON-parses) search results from a userstyles.org search API.
   * Automatically sets currentPage and totalPages.
   * @param {string} category The usrestyles.org "category" (subcategory) OR a any search string.
   * @return {Object} Response object from userstyles.org
   */
  function search(category) {
    if (totalPages !== undefined && currentPage > totalPages) {
      return Promise.resolve({'data':[]});
    }

    const searchURL = BASE_URL +
      '/api/v1/styles/subcategory' +
      '?search=' + encodeURIComponent(category) +
      '&page=' + currentPage +
      '&country=NA';

    const cacheKey = category + '/' + currentPage;

    return readCache(cacheKey)
      .then(json => json ||
        download(searchURL, {
          method: 'GET',
          headers: {
            'Content-type': 'application/json',
            'Accept': '*/*'
          },
          responseType: 'json',
          body: null
        }).then(json => {
          json.id = cacheKey;
          writeCache(json);
          return json;
        }))
      .then(json => {
        currentPage = json.current_page + 1;
        totalPages = json.total_pages;
        exhausted = (currentPage > totalPages);
        return json;
      }).catch(reason => {
        exhausted = true;
        return Promise.reject(reason);
      });
  }

  function readCache(id) {
    return BG.chromeLocal.getLZValue(CACHE_PREFIX + id).then(data => {
      if (!data || Date.now() - data.cacheWriteDate < CACHE_DURATION) {
        return data;
      }
      BG.chromeLocal.remove(CACHE_PREFIX + id);
    });
  }

  function writeCache(data) {
    debounce(cleanupCache, 10e3);
    data.cacheWriteDate = Date.now();
    return BG.chromeLocal.setLZValue(CACHE_PREFIX + data.id, data)
      .then(() => data);
  }

  function cleanupCache() {
    new Promise(resolve =>
      chrome.storage.local.getBytesInUse &&
      chrome.storage.local.getBytesInUse(null, resolve) ||
      1e9
    )
    .then(size => size > 1e6 || Promise.reject())
    .then(() => BG.chromeLocal.getValue(CACHE_PREFIX + 'Cleanup'))
    .then((lastCleanup = 0) =>
      Date.now() - lastCleanup > CACHE_DURATION &&
      chrome.storage.local.get(null, storage => {
        const expired = [];
        for (const key in storage) {
          if (key.startsWith(CACHE_PREFIX) &&
              Date.now() - storage[key].cacheWriteDate > CACHE_DURATION) {
            expired.push(key);
          }
        }
        if (expired.length) {
          chrome.storage.local.remove(expired);
        }
        BG.chromeLocal.setValue(CACHE_PREFIX + 'Cleanup', Date.now());
      }))
    .catch(ignoreChromeError);
  }
}
