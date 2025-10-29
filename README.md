# 🎨 Stylus - restyle the web!
**User style manager for Chrome, Firefox and Chromium/Gecko based browsers.**

The "Stylus" extension is a fork of the popular Stylish extension which can be used to restyle the web. Not "ish", but "us", as in "us" the actual users. Stylus is a fork of Stylish that is based on the source code of version 1.5.2, which was the most up-to-date version before the original developer stopped working on the project. The objective in creating Stylus was to remove any and all analytics, and return to a more user-friendly UI. We recognize that the ability to transfer your database from Stylish is important, so this is the one and only feature we've implemented from the new version.

<details><summary><h2>Screenshots</h2></summary>

* Manager

   ![Style manager](.github/screenshots/manager.png)

* Installer

  ![Installer](.github/screenshots/installer.png)

* Editor

  ![Style editor](.github/screenshots/editor.png)

* Popup search

  ![Popup inline search](.github/screenshots/popup-search.png)

* Popup config

  ![Popup config for usercss](.github/screenshots/popup-config.png)

* Manager config

  ![Style manager config for usercss](.github/screenshots/manager-config.png)

* Options

  ![Options](.github/screenshots/options.png)

</details>

## 🪄 Highlights

* Lightweight content script (10kB) runs in about a millisecond so it doesn't slow down web pages
* In addition to the [userstyles.org](userstyles.org) site, styles with customizable parameters can also be installed from [.user.css](https://github.com/openstyles/stylus/wiki/Usercss) or .user.styl URLs.
* Site styles can be discovered and previewed in the popup using inline search with screenshot thumbnails.
* A backup feature which is compatible with other userstyles managers.
* Configurable automatic update function for installed styles.
* Customizable UI, optional layouts, and tweaks.
* Two different optional code validators with user-configurable rules: CSSLint and Stylelint.
  * Both validators use Web Worker API to run in a separate background thread inside the editor tab without blocking your interaction with the code.
  * CSSLint is heavily modified compared to the effectively frozen original one and supports various CSS3 features as well as CSS4 Color and CSS Grid syntax.

## 💾 Install

🦊 Firefox: [Firefox add-ons](https://addons.mozilla.org/firefox/addon/styl-us) • 🔵 Chrome: [Chrome Web Store](https://chrome.google.com/webstore/detail/stylus/clngdbkpkpeebahjckkjfobafhncgmne) • ⚙️ Beta: [Github Releases](https://github.com/openstyles/stylus/releases)

## ❤️ Contributing
 🛠 [Pull requests](https://github.com/openstyles/stylus/pulls) are welcome, 🌎 translation work can be done on [Transifex](https://explore.transifex.com/github-7/Stylus).

See our [contributing](./.github/CONTRIBUTING.md) page for more details.

## ℹ️ Help

* 📖 Check the [FAQ in our Wiki](https://github.com/openstyles/stylus/wiki)
* 💭 [Discussion section](https://add0n.com/stylus.html#reviews) of our representation on add0n.com
* 💜 Join our [Discord](https://discord.com/invite/vvqTT5Tp) server: [![Discord][chat-image]][chat-link]

[chat-image]: https://img.shields.io/discord/379521691774353408.svg
[chat-link]: https://discordapp.com/widget?id=379521691774353408

## 📃 License
Copyright &copy; 2005-2014 [Jason Barnabe](jason.barnabe@gmail.com)

Copyright &copy; 2017-2025 [Stylus Team](https://github.com/openstyles/stylus/graphs/contributors)
