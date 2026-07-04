import { buildSocialResearchToolJsonSchemas } from './social-research-tool-json-schemas';

describe('buildSocialResearchToolJsonSchemas', () => {
  it('exports language-neutral input schemas for all social research tools', () => {
    const schemas = buildSocialResearchToolJsonSchemas();

    expect(Object.keys(schemas)).toEqual([
      'search_social',
      'explain_search_plan',
      'fetch_thread',
      'rank_results',
      'list_social_sources',
      'explain_source_readiness',
    ]);
    expect(schemas.search_social).toMatchObject({
      type: 'object',
      properties: {
        topic: { type: 'string' },
        accounts: expect.any(Object),
        products: expect.any(Object),
        execution: {
          type: 'object',
        },
      },
    });
    expect(schemas.rank_results).toMatchObject({
      type: 'object',
      properties: {
        items: {
          type: 'array',
        },
      },
    });
    expect(schemas.list_social_sources).toMatchObject({
      type: 'object',
      properties: {
        sourceKeys: {
          type: 'array',
        },
      },
    });
    expect(schemas.explain_source_readiness).toMatchObject({
      type: 'object',
      properties: {
        sourceKey: { type: 'string' },
      },
    });
  });
});
