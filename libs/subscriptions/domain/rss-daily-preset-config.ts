// RSS/Google News daily feed configuration for the AI developer preset.
export const rssConfig = {
  maxItems: 30,
  maxItemAgeHours: 48,
} as const;

export const googleNewsDailyFeedUrl =
  "https://news.google.com/rss/search?q=%22artificial%20intelligence%22%20OR%20OpenAI%20OR%20Anthropic%20OR%20Claude%20OR%20%22Claude%20Code%22%20OR%20%22OpenAI%20Codex%22%20OR%20Cursor%20OR%20%22AI%20agents%22%20OR%20LLM%20OR%20%22developer%20tools%22%20OR%20cybersecurity%20OR%20%22AI%20security%22%20OR%20Flutter%20OR%20Dart%20OR%20JavaScript%20OR%20%22Node.js%22%20OR%20TypeScript%20OR%20Python%20OR%20Rust%20OR%20Go%20OR%20MCP%20OR%20%22MCP%20server%22%20OR%20LangChain%20OR%20RAG%20OR%20%22vibe%20coding%22%20OR%20%22open%20source%20LLM%22%20when%3A1d&hl=en-US&gl=US&ceid=US:en";

export const supplementalRssFeedUrls = [
  "https://hnrss.org/best",
  "https://hnrss.org/frontpage",
  "https://hnrss.org/newest?q=AI%20agents",
  "https://hnrss.org/newest?q=Claude%20Code",
  "https://hnrss.org/newest?q=OpenAI%20Codex",
  "https://hnrss.org/newest?q=MCP",
  "https://hnrss.org/newest?q=MCP%20server",
  "https://hnrss.org/newest?q=Cursor%20AI",
  "https://hnrss.org/newest?q=developer%20tools",
  "https://hnrss.org/newest?q=Flutter%20Dart",
  "https://hnrss.org/newest?q=TypeScript",
  "https://hnrss.org/newest?q=Rust",
  "https://hnrss.org/newest?q=Go",
  "https://hnrss.org/newest?q=LangChain%20RAG",
  "https://hnrss.org/newest?q=vibe%20coding",
  "https://hnrss.org/newest?q=open%20source%20AI",
  "https://hnrss.org/newest?q=open%20source%20LLM",
  "https://hnrss.org/newest?q=cybersecurity",
  "https://hnrss.org/newest?q=AI%20security",
  "https://hnrss.org/newest?q=security%20vulnerability",
  "https://openai.com/news/rss.xml",
  "https://github.blog/feed/",
  "https://blog.cloudflare.com/rss/",
  "https://martinfowler.com/feed.atom",
] as const;

export const googleNewsRssConfig = {
  ...rssConfig,
  extraFeedUrls: supplementalRssFeedUrls,
} as const;
