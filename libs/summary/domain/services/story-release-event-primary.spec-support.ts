/** Complete R7/R8/R9 inputs, copied from independent review; outside frozen gold. */
export const primaryEventReviewCases = [
  {
    "name": "other_subject_then_primary_preview",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Lyra 8.4 is generally available, while Vela 7.3 is still in beta preview.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Lyra 8.4 is generally available, while Vela 7.3 is still in beta preview.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "other_subject_then_primary_old_date",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "bodyPreview": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Lyra 8.4 was released on September 1, 2026, while Vela 7.3 was already released on August 1, 2026.",
        "sourceText": "Orion releases Vela 7.3. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Lyra 8.4 was released on September 1, 2026, while Vela 7.3 was already released on August 1, 2026.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "other_subject_semicolon_primary_preview",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Lyra 8.4 is generally available; Vela 7.3 is still in beta preview.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Lyra 8.4 is generally available; Vela 7.3 is still in beta preview.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "publisher_active_compound_primary_preview",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Orion releases Lyra 8.4, while Vela 7.3 is still in beta preview.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Orion releases Lyra 8.4, while Vela 7.3 is still in beta preview.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "third_party_ran_tasks",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Vela 7.3 coding benchmark results",
        "bodyPreview": "Orion released Vela 7.3 on September 1. Vega Labs ran 900 coding tasks on Vela 7.3 and found a large regression vs its predecessor. These results contradict the publisher announcement.",
        "sourceText": "Orion released Vela 7.3 on September 1. Vega Labs ran 900 coding tasks on Vela 7.3 and found a large regression vs its predecessor. These results contradict the publisher announcement.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "security_comparison_headline",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "bodyPreview": "Orion released Vela 7.3 on September 1. Attackers exploited Vela 7.3 in a coding service and stole credentials from 900 users. The breach demonstrates worse isolation vs its predecessor. This post reports the breach and its outcome.",
        "sourceText": "Orion released Vela 7.3 on September 1. Attackers exploited Vela 7.3 in a coding service and stole credentials from 900 users. The breach demonstrates worse isolation vs its predecessor. This post reports the breach and its outcome.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "separate_quota_event",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Orion launches Vela 7.3 for coding compared to its predecessor",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Orion doubled the API quota for existing Vela 7.3 customers. This post reports the quota change.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks. Orion doubled the API quota for existing Vela 7.3 customers. This post reports the quota change.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "security_report_comparison_title",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Vela 7.3 coding isolation compared to its predecessor",
        "bodyPreview": "Orion released Vela 7.3 on September 1. Attackers exploited Vela 7.3 in a coding service and stole credentials from 900 users. The breach demonstrates worse isolation vs its predecessor. This post reports the breach and its outcome.",
        "sourceText": "Orion released Vela 7.3 on September 1. Attackers exploited Vela 7.3 in a coding service and stole credentials from 900 users. The breach demonstrates worse isolation vs its predecessor. This post reports the breach and its outcome.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  },
  {
    "name": "quota_report_comparison_title",
    "mayMerge": false,
    "inputs": [
      {
        "feedItemId": "left",
        "providerKey": "reddit",
        "sourceItemId": "source:left",
        "sourceBindingId": "binding:reddit",
        "interestId": "fixture-release",
        "canonicalUrl": "https://left.example.test/post",
        "title": "Orion introduces Vela 7.3 for coding at lower cost",
        "bodyPreview": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "sourceText": "Orion releases Vela 7.3 on September 1. Vela 7.3 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      },
      {
        "feedItemId": "right",
        "providerKey": "x-twitter",
        "sourceItemId": "source:right",
        "sourceBindingId": "binding:x-twitter",
        "interestId": "fixture-release",
        "canonicalUrl": "https://right.example.test/post",
        "title": "Vela 7.3 coding access compared to its predecessor",
        "bodyPreview": "Orion released Vela 7.3 on September 1. Orion doubled the API quota for existing Vela 7.3 customers. The additional coding capacity improves task throughput vs its predecessor. This post reports the quota change.",
        "sourceText": "Orion released Vela 7.3 on September 1. Orion doubled the API quota for existing Vela 7.3 customers. The additional coding capacity improves task throughput vs its predecessor. This post reports the quota change.",
        "publishedAt": "2026-09-01T12:00:00.000Z",
        "observedAt": "2026-09-01T12:05:00.000Z",
        "score": 2,
        "whyImportant": []
      }
    ]
  }
] as const;
