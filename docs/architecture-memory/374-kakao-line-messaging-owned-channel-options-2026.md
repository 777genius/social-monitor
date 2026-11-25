# 374 - Kakao/LINE Messaging Owned-Channel Options 2026

## Last Verified

2026-06-04.

## Sources

- Kakao Developers docs: https://developers.kakao.com/docs/en
- Kakao Talk Channel API concepts: https://developers.kakao.com/docs/en/kakaotalk-channel/common
- Kakao Business messaging: https://us.business.kakao.com/info/bizmessage/
- LINE Messaging API receiving messages: https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- LINE Official Account context: https://developers.line.biz/en/
- Kakao/LINE regional messaging context reviewed 2026-06-04.

## Current Reality

KakaoTalk and LINE are not public social listening sources. They are messaging and owned-channel/customer communication platforms.

They can matter later for tenant-owned customer support, alert delivery and official-account workflows, but they should not be modeled as public scanning sources.

## Kakao Option A - Kakao Talk Channel APIs

Pros:

- official developer docs
- useful for owned Kakao Talk Channel relationship/customer management
- fits business messaging workflows

Cons:

- owned/authorized channel only
- not public community listening
- regional onboarding and business rules apply

Use for:

- tenant-owned Korean customer channel

## Kakao Option B - Kakao Business Messaging Providers

Pros:

- supports business communication workflows
- possible integration through approved providers

Cons:

- messaging/comms, not scanning
- strict template/consent rules

Use for:

- notification/support channel, not source ingestion

## LINE Option C - LINE Messaging API Webhooks

Pros:

- official webhook model
- reliable for owned LINE Official Account messages/events
- good for customer-support integrations

Cons:

- only messages/events involving the tenant's official account
- no broad public social monitoring

Use for:

- owned-account customer inbox
- alert delivery

## Option D - Chat/App Automation

Decision:

```text
rejected_not_production_safe
```

## Recommended Path

```text
owned_channel_only; defer until product adds customer inbox / delivery integrations
```

## Architecture Rule

Kakao/LINE belong to `OwnedMessagingChannelPort`, not `SocialSourceProviderPort`.

