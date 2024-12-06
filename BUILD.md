# Build this project

## Preparation

1. Install [Node.js](https://nodejs.org/en/).
2. Go to the project root, run `npm install`. This will install all required dependencies.

## Preparation for Transifex

Extra preparations are needed if you want to pull locale files from Transifex:

1. Install Transifex client. Follow the instructions on [this page](https://docs.transifex.com/client/installing-the-client).
2. You need a `.transifexrc` file in the root folder. Contact another admin if you need one. It includes the API key to use Transifex's API.

## Build

| type         | command                    |
|--------------|----------------------------|
| Chrome (MV2) | `npm run build-chrome-mv2` |
| Chrome (MV3) | `npm run build-chrome-mv3` |
| Firefox      | `npm run build-firefox`    |

⚠ `dist` folder is not cleared.

## Watch / develop

| type | command             |
|------|---------------------|
| MV2  | `npm run watch-mv2` |
| MV3  | `npm run watch-mv3` |

⚠ `dist` folder is not cleared.

## Create ZIP files for an extension gallery

The files are created in the project root directory.

| type              | command                       |
|-------------------|-------------------------------|
| All               | `npm run zip`                 |
| Chrome (MV2)      | `npm run zip-chrome-mv2`      |
| Chrome (MV3)      | `npm run zip-chrome-mv3`      |
| Chrome (MV3 beta) | `npm run zip-chrome-mv3-beta` |
| Firefox           | `npm run zip-firefox`         |

## Tag a release/Bump the version

| type   | command             |
|--------|---------------------|
| Stable | `npm version minor` |
| Beta   | `npm version patch` |

There are some scripts that will run automatically before/after tagging a version. Includes:

1. Test.
2. Update version number in `manifest.json`.
3. Generate the ZIP file.
4. Push the tag to github.

## Translation

We host locale files (`message.json`) on Transifex. All the files exist in our GitHub repository, but if you need to update the locale files, you will need to install the [Transifex client](https://docs.transifex.com/client/installing-the-client)

To pull files from Transifex, run

```
npm run update-locales
```

To push files to Transifex:

```
npm run update-transifex
```
