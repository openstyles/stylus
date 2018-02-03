'use strict';

(() => {
  // begin:nanographql - Tiny graphQL client library
  // Author: yoshuawuyts (https://github.com/yoshuawuyts)
  // License: MIT
  // Modified by DecentM to fit project standards

  const getOpname = /(query|mutation) ?([\w\d-_]+)? ?\(.*?\)? \{/;
  const gql = str => {
    str = Array.isArray(str) ? str.join('') : str;
    const name = getOpname.exec(str);

    return variables => {
      const data = {query: str};
      if (variables) data.variables = JSON.stringify(variables);
      if (name && name.length) {
        const operationName = name[2];
        if (operationName) data.operationName = name[2];
      }
      return JSON.stringify(data);
    };
  };

  // end:nanographql

  const api = 'https://api.openusercss.org';
  const doQuery = ({id}, queryString) => {
    const query = gql(queryString);

    return fetch(api, {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json'
      }),
      body: query({
        id
      })
    })
    .then(res => res.json());
  };

  window.API_METHODS = Object.assign(window.API_METHODS || {}, {
    /**
     *   This function can be used to retrieve a theme object from the
     *   GraphQL API, set above
     *
     *   Example:
     *   chrome.runtime.sendMessage({
     *     'method': 'oucThemeById',
     *     'id': '5a2f819f7c57c751001b49df'
     *   }, console.log);
     *
     *   @param {ID} $0.id MongoDB style ID
     *   @returns {Promise.<{data: object}>} The GraphQL result with the `theme` object
     */

    oucThemeById: params => doQuery(params, `
      query($id: ID!) {
        theme(id: $id) {
          _id
          title
          description
          createdAt
          lastUpdate
          version
          screenshots
          user {
            _id
            displayname
          }
        }
      }
    `),

    /**
     *   This function can be used to retrieve a user object from the
     *   GraphQL API, set above
     *
     *   Example:
     *   chrome.runtime.sendMessage({
     *     'method': 'oucUserById',
     *     'id': '5a2f0361ba666f0b00b9c827'
     *   }, console.log);
     *
     *   @param {ID} $0.id MongoDB style ID
     *   @returns {Promise.<{data: object}>} The GraphQL result with the `user` object
     */

    oucUserById: params => doQuery(params, `
      query($id: ID!) {
        user(id: $id) {
          _id
          displayname
          avatarUrl
          smallAvatarUrl
          bio
        }
      }
    `),
  });
})();
