# Technology Stack

**Analysis Date:** 2026-06-24

## Languages

**Primary:**
- JavaScript - Mini program runtime in `app.js`, `pages/**/*.js`, `utils/*.js`, `cloudfunctions/*/index.js`

**Secondary:**
- JSON - app and project configuration in `app.json`, `project.config.json`, `sitemap.json`, `cloudfunctions/*/package.json`
- WXSS/WXML - Mini program views and styles in `pages/**/*.wxml` and `pages/**/*.wxss`

## Runtime

**Environment:**
- WeChat Mini Program runtime
- Cloud Functions runtime via WeChat Cloud Development (`wx-server-sdk`)
- Base library: `3.16.1` from `project.config.json`

**Package Manager:**
- npm-style per-cloud-function installs
- Lockfile: present in each cloud function directory, root lockfile not detected

## Frameworks

**Core:**
- WeChat Mini Program framework - page lifecycle, tab bar, storage, navigation, and cloud APIs in `app.js` and `pages/*.js`
- WeChat Cloud Development - initialized in `app.js` with `wx.cloud.init(...)`

**Testing:**
- Not detected in the root app runtime
- External test harness found under `_external/cc-switch` only; excluded from app analysis

**Build/Dev:**
- WeChat Developer Tools project format from `project.config.json`
- Mini program packaging uses `cloudfunctionRoot: "cloudfunctions/"`

## Key Dependencies

**Critical:**
- `wx-server-sdk` - cloud function SDK in `cloudfunctions/createRoom/package.json`, `cloudfunctions/dataOp/package.json`, `cloudfunctions/getMyRoom/package.json`, `cloudfunctions/joinRoom/package.json`, `cloudfunctions/login/package.json`

**Infrastructure:**
- WeChat cloud APIs - `wx.cloud.callFunction`, `wx.cloud.init`, storage, clipboard, filesystem, share, and navigation in `app.js`, `utils/cloud.js`, and `pages/*.js`

## Configuration

**Environment:**
- Cloud environment is hard-coded in `app.js` as `cloud1-d8gyqvcez4e66b3da`
- App ID is configured in `project.config.json`
- Local room binding is stored with `wx.setStorageSync('roomCode', ...)`

**Build:**
- `app.json` defines pages, tab bar, window style, sitemap, and lazy component loading
- `project.config.json` controls miniprogram compilation, ES6/postcss/minification, and cloud function root
- `sitemap.json` is enabled for mini program search/indexing

## Platform Requirements

**Development:**
- WeChat DevTools-compatible environment
- Cloud Development enabled for the project environment referenced in `app.js`

**Production:**
- WeChat Mini Program deployment target
- Cloud Functions deployed under `cloudfunctions/`

---

*Stack analysis: 2026-06-24*
