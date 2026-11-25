# 247 - Mobile Background Execution Policy

## Decision

Social scanning runs on backend workers, not on the mobile app.

The mobile app may perform limited background tasks for notification handling, cache refresh hints or upload completion, but it must not be responsible for reliable periodic source scans.

## Sources

- Apple BackgroundTasks framework: https://developer.apple.com/documentation/backgroundtasks
- Android background tasks overview: https://developer.android.com/develop/background-work/background-tasks
- Android WorkManager: https://developer.android.com/topic/libraries/architecture/workmanager
- Firebase Cloud Messaging Flutter receive messages: https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages

## Why This Is Locked

iOS and Android heavily constrain background execution based on lifecycle, battery, permissions, user actions and OS policy.

The product requirement is reliable periodic scanning. That belongs on backend scheduler/workers.

## Mobile Background Uses

Allowed:

- process push notification tap
- refresh visible feed after notification
- complete a local export/share action
- sync pending local preferences when app resumes
- opportunistic cache refresh

Not allowed:

- periodic Reddit/X/HN/Telegram scanning
- source credential refresh as mobile responsibility
- long-running summary generation
- guaranteed scheduled polling
- provider API calls requiring tenant secrets

## iOS Constraints

Apple BackgroundTasks are system-scheduled and not a reliable timer.

The app must assume:

- tasks may be delayed
- tasks may not run after force quit
- execution time is limited
- network availability is not guaranteed

## Android Constraints

Android background work should use platform APIs such as WorkManager where needed, but execution still depends on OS constraints, battery optimization and app state.

Do not build product correctness around immediate background execution.

## Backend Responsibility

Backend owns:

- scan schedule
- source credentials
- provider rate limits
- retries/DLQ
- summaries
- digest assembly
- notification dispatch

Mobile owns:

- presentation
- user preferences
- local cache
- notification permission/UX
- user-triggered commands

## UX Rule

If the app cannot refresh in background, it should show last synced time and refresh on foreground/resume.

Do not promise exact background freshness from mobile.

## Testing

Required:

- app resume refresh
- push tap opens correct route
- no background task required for scan completion
- offline foreground cache behavior
- force-quit behavior documented for QA

## Architecture Rule

Mobile is a client of the monitoring platform, not the monitoring engine.
