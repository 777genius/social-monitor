import { parseGitHubTrendingRepositoriesHtml } from './github-trending-page-html-parser';

describe('parseGitHubTrendingRepositoriesHtml', () => {
  it('extracts repositories, rank and stars gained from the public GitHub Trending page shape', () => {
    const repositories = parseGitHubTrendingRepositoriesHtml(
      `
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/calesthio/OpenMontage" class="Link">
            <span class="text-normal">calesthio /</span>
            OpenMontage
          </a>
        </h2>
        <p class="col-9 color-fg-muted my-1">
          World's first open-source, agentic video production system.
        </p>
        <span itemprop="programmingLanguage">Python</span>
        <a href="/calesthio/OpenMontage/stargazers">18,398</a>
        <a href="/calesthio/OpenMontage/forks">2,113</a>
        <span>3,703 stars today</span>
      </article>
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/apple/container" class="Link">
            <span class="text-normal">apple /</span>
            container
          </a>
        </h2>
        <p>A tool for creating and running Linux containers using lightweight virtual machines.</p>
        <span itemprop="programmingLanguage">Swift</span>
        <a href="/apple/container/stargazers">41,719</a>
        <a href="/apple/container/forks">1,219</a>
        <span>1,746 stars today</span>
      </article>
    `,
      10,
    );

    expect(repositories).toEqual([
      {
        fullName: 'calesthio/OpenMontage',
        url: 'https://github.com/calesthio/OpenMontage',
        description:
          "World's first open-source, agentic video production system.",
        language: 'Python',
        totalStars: 18398,
        forksCount: 2113,
        starsGained: 3703,
        rank: 1,
      },
      {
        fullName: 'apple/container',
        url: 'https://github.com/apple/container',
        description:
          'A tool for creating and running Linux containers using lightweight virtual machines.',
        language: 'Swift',
        totalStars: 41719,
        forksCount: 1219,
        starsGained: 1746,
        rank: 2,
      },
    ]);
  });

  it('deduplicates repeated repositories before applying the requested limit', () => {
    const repositories = parseGitHubTrendingRepositoriesHtml(
      `
      <article class="Box-row">
        <h2><a href="/apple/container">apple / container</a></h2>
        <p>Container runtime.</p>
        <span itemprop="programmingLanguage">Swift</span>
        <a href="/apple/container/stargazers">41,719</a>
        <a href="/apple/container/forks">1,219</a>
        <span>1,746 stars today</span>
      </article>
      <article class="Box-row">
        <h2><a href="/apple/container">apple / container</a></h2>
        <p>Duplicate row that should not consume top-N budget.</p>
        <span itemprop="programmingLanguage">Swift</span>
        <a href="/apple/container/stargazers">41,719</a>
        <a href="/apple/container/forks">1,219</a>
        <span>1,746 stars today</span>
      </article>
      <article class="Box-row">
        <h2><a href="/calesthio/OpenMontage">calesthio / OpenMontage</a></h2>
        <p>Agentic video production system.</p>
        <span itemprop="programmingLanguage">Python</span>
        <a href="/calesthio/OpenMontage/stargazers">18,398</a>
        <a href="/calesthio/OpenMontage/forks">2,113</a>
        <span>3,703 stars today</span>
      </article>
    `,
      2,
    );

    expect(repositories.map((repository) => ({
      fullName: repository.fullName,
      rank: repository.rank,
    }))).toEqual([
      { fullName: 'apple/container', rank: 1 },
      { fullName: 'calesthio/OpenMontage', rank: 2 },
    ]);
  });
});
