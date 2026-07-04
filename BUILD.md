# Build this project

## Preparation

1. Install [Node.js](https://nodejs.org/en/).
2. Install PNPM e.g. run `npm install -g pnpm` or use another method for your OS, see https://pnpm.io/installation
3. Go to the project root, run `pnpm i`. This will install all required dependencies.

## Preparation for Transifex

Extra preparations are needed if you want to pull locale files from Transifex:

1. Install Transifex client. Follow the instructions on [this page](https://docs.transifex.com/client/installing-the-client).
2. You need a `.transifexrc` file in the root folder. Contact another admin if you need one. It includes the API key to use Transifex's API.

## Build / watch

| type                  | command                 |
|-----------------------|-------------------------|
| MV2 for any browser   | `pnpm build-mv2`        |
| MV2 Firefox optimized | `pnpm build-firefox`    |
| MV3 Chrome/Chromiums  | `pnpm build-chrome-mv3` |
| MV2                   | `pnpm watch-mv2`        |
| MV3                   | `pnpm watch-chrome-mv3` |

⚠ `dist` folder is cleared only in build mode.
See package.json for other variants.

You can also manually run `node tools/build.js` with arguments `[build|watch|serve] [any|chrome|firefox] [mv2|mv3]`
* every parameter is optional
* the default is `build` `any` `mv2`
* `firefox` is hardcoded to produce `mv2` build
* `mv3` is hardcoded to produce an optimized `chrome` build

## Tag a release/Bump the version

| type     | command            |
|----------|--------------------|
| Beta/Dev | `pnpm bump`        |
| Stable   | `pnpm bump-stable` |

There are some scripts that will run automatically before/after tagging a version. Includes:

1. Test.
2. Update version number in `manifest.json`.
3. Generate the ZIP file.
4. Push the tag to GitHub.

## Translation

We host locale files (`message.json`) on Transifex. All the files exist in our GitHub repository, but if you need to update the locale files, you will need to install the [Transifex client](https://docs.transifex.com/client/installing-the-client)

To pull files from Transifex, run

```
pnpm update-locales
```

To push files to Transifex:

```
pnpm update-transifex
```
