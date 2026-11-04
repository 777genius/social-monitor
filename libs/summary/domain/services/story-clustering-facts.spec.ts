import * as factory from './story-clustering-facts';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SummaryEvidenceItem } from '../value-objects/summary-evidence-item';
import { STORY_RANKING_POLICY_V1 as policy } from '../policies/story-ranking-policy';
import { belongsToVerifiedStoryCluster, hasCrossProviderClaimFacetConflict, verifiedStoryRelationPairKey } from './story-cluster-membership';
import { createStoryClusteringFacts, uncachedStoryClusteringFacts } from './story-clustering-facts';
import { StoryClusteringService } from './story-clustering.service';

const now = new Date('2026-11-03T12:00:00Z');
const item = (index: number): SummaryEvidenceItem => ({feedItemId:`f-${index}`,sourceItemId:`s-${index}`,
 sourceBindingId:`b-${index}`,interestId:'i',providerKey:index%2?'reddit':'rss',
 canonicalUrl:`https://${index%2?'reddit.com':'news.google.com'}/posts/${index}`,
 title:['Claude 4 release adds coding tools','Claude 4 benchmark results improve','OpenAI security vulnerability disclosed','DeepSeek V3 release efficiency improvements'][index%4]!,
 bodyPreview:`${'Research release benchmark coding efficiency details '.repeat(20)} ${index}`,
 publishedAt:now,observedAt:now,score:index,whyImportant:[]});
const identity={tenantId:tenantId('tenant'),workspaceId:workspaceId('workspace'),scope:{type:'workspace' as const}};

describe('per-build clustering facts',()=>{
 it('matches uncached predicates including verified, strict-title and conflicting facets',()=>{
  const posts=Array.from({length:24},(_,i)=>item(i)),facts=createStoryClusteringFacts();
  for(const left of posts)for(const right of posts){
   const pairs=new Set([verifiedStoryRelationPairKey(left.feedItemId,right.feedItemId)]);
   for(const strict of [undefined,pairs])expect(belongsToVerifiedStoryCluster(left,[right],policy,pairs,strict,facts))
    .toBe(belongsToVerifiedStoryCluster(left,[right],policy,pairs,strict));
   expect(hasCrossProviderClaimFacetConflict(left,[right],policy,facts))
    .toBe(hasCrossProviderClaimFacetConflict(left,[right],policy));
  }
 });
 it('computes item facts once and separates fresh policy/content invocations',()=>{
  let reads=0;
  const original=item(0),post={...original,get bodyPreview(){reads+=1;return original.bodyPreview;}},facts=createStoryClusteringFacts();
  const first=facts.storyTopicTokens(post,policy),firstReads=reads;
  for(let i=0;i<100;i++)expect(facts.storyTopicTokens(post,policy)).toBe(first);
  expect(reads).toBe(firstReads);
  expect(facts.storyClaimFacetTokens(post)).toBe(facts.storyClaimFacetTokens(post));
  const changed={...post,title:'Unrelated security vulnerability report',bodyPreview:'New context'};
  const fresh=createStoryClusteringFacts(),short={...policy,semanticTopicMaxTokens:1};
  expect(fresh.storyTopicTokens(changed,short)).toEqual(uncachedStoryClusteringFacts.storyTopicTokens(changed,short));
  expect(fresh.storyTopicTokens(post,short)).toHaveLength(1);
  expect(facts.storyTopicTokens(post,short)).toEqual(uncachedStoryClusteringFacts.storyTopicTokens(post,short));
  expect(facts.storyTopicTokens(post,policy)).toEqual(uncachedStoryClusteringFacts.storyTopicTokens(post,policy));
 });
 it('keeps full selection identical to an invocation using uncached facts',()=>{
  const service=new StoryClusteringService({now:()=>now});
  const params={identity,items:Array.from({length:16},(_,i)=>item(i)),limit:16,now};
  const cached=service.cluster(params);
  const spy=jest.spyOn(factory,'createStoryClusteringFacts').mockReturnValue(uncachedStoryClusteringFacts);
  try{expect(service.cluster(params)).toEqual(cached);}finally{spy.mockRestore();}
 });
});

it('benchmarks 1220 items with identical pair decisions',()=>{
 const posts=Array.from({length:1220},(_,i)=>({...item(i),providerKey:'rss',canonicalUrl:`https://example.test/article/${i}`,bodyPreview:'Distinct source evidence'}));
 const run=(cached:boolean)=>{const facts=cached?createStoryClusteringFacts():uncachedStoryClusteringFacts;let matches=0;const started=performance.now();
  for(let i=0;i<posts.length;i++)for(let j=0;j<i;j++)if(belongsToVerifiedStoryCluster(posts[i]!,[posts[j]!],policy,undefined,undefined,facts))matches++;
  return {ms:performance.now()-started,matches};};
 const uncached=run(false),cached=run(true);expect(cached.matches).toBe(uncached.matches);
 console.info(JSON.stringify({items:1220,pairs:743590,uncached,cached,speedup:uncached.ms/cached.ms}));
},180000);
