# [Social Monitor](https://social-monitor.app/)

<a href="https://discord.gg/MWmrv57Qkt"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Fv10%2Finvites%2FqtqSZSyuEc%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&label=Discord&logo=discord&logoColor=white&color=5865F2&style=flat-square&suffix=%20members" alt="Discord" /></a>
<a href="https://social-monitor.app/"><img src="https://img.shields.io/badge/Site-social--monitor.app-22C55E?style=flat-square&logo=googlechrome&logoColor=white" alt="Social Monitor Site" /></a>
<a href="https://codecov.io/gh/777genius/social-monitor"><img src="https://codecov.io/gh/777genius/social-monitor/branch/main/graph/badge.svg" alt="Backend unit test coverage" /></a>

**Follow your interests, skip the noise.** Social Monitor collects posts across social networks, news and the web, ranks what matters, and turns it into readable AI summaries with links to the sources.

## What you can do

- **Monitor topics across sources:** X/Twitter, Reddit, Hacker News, RSS/Atom and GitHub, with provider-specific setup.
- **Read the highlights:** ranked top posts, concise explanations, source citations and collection coverage in one place.
- **Go deeper when needed:** compact post summaries with an original-text toggle.
- **Catch up on your schedule:** daily reader summaries, rolling four-hour updates and a weekly digest pipeline.
- **Make it personal:** interest profiles, post ratings and relevance feedback feed into personalized ranking.
- **Share the result:** published summary pages and backend delivery workflows.

<img width="2178" height="1157" alt="image" src="https://github.com/user-attachments/assets/926b1651-0a48-496e-9d29-201d22edc7a6" />

<img width="1777" height="1157" alt="image" src="https://github.com/user-attachments/assets/39247c45-867c-4935-b4cc-114a17739627" />

## Current status

An actively developed full-stack product with connected Flutter screens, persistent collection and summary pipelines, and production deployment workflows. The repository includes the API, workers, private X collector and web frontend.

Hacker News, RSS, GitHub Trending, Repo Radar and Reddit have beta provider implementations. X uses the private collector; GitHub Issues is manual-only; Telegram is deferred. See [feature status](docs/reference/feature-status.md) and [provider setup](docs/providers/README.md) for availability and requirements.

## Run and develop

Built with **Flutter/Dart, NestJS/TypeScript, PostgreSQL, RabbitMQ and Redis**.

- [Getting started](docs/reference/getting-started.md): backend, Docker and connected or demo frontend.
- [Collect your first source](docs/providers/README.md#fast-path): interest, source binding, scan and feed.
- [Development reference](docs/reference/development.md): stack, repository map, commands and architecture links.

## License

Apache 2.0 for original project material. See [LICENSE](LICENSE) and [NOTICE](NOTICE); third-party components retain their own terms.
