# Migo — Developer Notes

## Web Build Configuration (SDK 52)

### Problem: import.meta error on web
Root cause: Metro resolving ESM files via package.json 
exports field — incompatible with Metro web bundler.

### Fix applied:

babel.config.js — keep minimal:
- Only babel-plugin-transform-import-meta plugin
- Do NOT add react-native-reanimated/plugin manually
  (reanimated v4 auto-registers via babel-preset-expo
  — adding it manually breaks the build with 
  "Cannot find module react-native-worklets/plugin")

metro.config.js — required settings:
- config.resolver.unstable_enablePackageExports = false
- sourceExts includes 'mjs' and 'cjs'  
- config.transformer.unstable_allowRequireContext = true

## Port Management
- Server runs on 3001
- Dashboard runs on 3000  
- Expo runs on 8081
- If port 3001 is stuck: netstat -ano | findstr :3001
  then: taskkill /F /PID <pid>

## Docker
- Start containers after reboot:
  docker start friendscape-pg
  docker start friendscape-redis

## AI Service
- Never trust UUIDs returned by Claude API
- Always resolve foreign keys from your own DB data
- Use name→UUID lookup maps when saving AI-generated content

## Mood Safety System
- Parse failures default to parentAlertNeeded: true
- Physical harm + secret arrangements trigger crisis flags
- checkMood uses Haiku model for cost efficiency
