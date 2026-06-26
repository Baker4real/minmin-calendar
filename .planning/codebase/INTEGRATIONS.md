---
last_mapped_commit: d4bd56de253c41a597431a5f96b93598413dfa83
last_mapped_at: "2026-06-26T12:30:43.422Z"
---

# External Integrations

**Analysis Date:** 2026-06-26

## APIs & External Services

**WeChat Mini Program APIs:**
- WeChat Cloud Functions - invoked from `app.js`, `pages/bind/bind.js`, `pages/settings/settings.js`, and `utils/cloud.js`
  - SDK/Client: built-in `wx.cloud`
  - Auth: implicit WeChat user context via cloud function `OPENID`
- WeChat Mini Program platform APIs - storage, modal, clipboard, filesystem, share, navigation, and device info in `pages/*.js` and `app.js`
  - SDK/Client: built-in `wx.*`
  - Auth: not applicable

**Cloud Development Backend:**
- Tencent WeChat Cloud Development environment - initialized with `wx.cloud.init({ env: 'cloud1-d8gyqvcez4e66b3da', traceUser: true })` in `app.js`
  - SDK/Client: `wx-server-sdk` in `cloudfunctions/*/index.js`
  - Auth: `cloud.getWXContext().OPENID`

## Data Storage

**Databases:**
- WeChat Cloud Database / CloudBase - used in `cloudfunctions/createRoom/index.js`, `cloudfunctions/joinRoom/index.js`, `cloudfunctions/getMyRoom/index.js`, and `cloudfunctions/dataOp/index.js`
  - Connection: Cloud environment from `app.js` and `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })` in cloud functions
  - Client: `wx-server-sdk`
- Collections detected: `rooms`, `periods`, `memories`

**File Storage:**
- Local filesystem only in the mini program client for export backups
  - Path example: `wx.env.USER_DATA_PATH` in `pages/settings/settings.js`

**Caching:**
- Local storage only
  - Key: `roomCode` via `wx.getStorageSync` / `wx.setStorageSync`

## Authentication & Identity

**Auth Provider:**
- WeChat identity via cloud function context
  - Implementation: `cloud.getWXContext().OPENID` in `cloudfunctions/login/index.js`, `cloudfunctions/createRoom/index.js`, `cloudfunctions/joinRoom/index.js`, `cloudfunctions/getMyRoom/index.js`, and `cloudfunctions/dataOp/index.js`
- No separate auth provider detected

## Monitoring & Observability

**Error Tracking:**
- Not detected

**Logs:**
- Local console logging only in `app.js` for missing cloud capability

## CI/CD & Deployment

**Hosting:**
- WeChat Mini Program + WeChat Cloud Development

**CI Pipeline:**
- Not detected

## Environment Configuration

**Required env vars:**
- Not detected as process env vars
- Cloud environment identifier is embedded in `app.js`

**Secrets location:**
- Not detected in repository

## Webhooks & Callbacks

**Incoming:**
- Not detected

**Outgoing:**
- Cloud function calls from the mini program client via `wx.cloud.callFunction`

---

*Integration audit: 2026-06-26*
