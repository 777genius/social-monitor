import {createHash} from 'node:crypto';
import type {TenantId,WorkspaceId} from '@social-monitor/shared-kernel';
import {planGitHubArchiveQualifiedPartition} from './plan-github-archive-qualified-partitions';

const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const fixture=()=>{
 const bytes=Buffer.from(JSON.stringify({pubDate:'Fri, 09 Oct 2026 08:18:47 GMT',items:Array.from({length:11},(_,index)=>({
  url:`https://github.com/example/repository${index}`,description:'Synthetic repository',language:'TypeScript',
  stars:1000,forks:2,added_stars:`${11-index} stars today`,
 }))}));
 const bindingConfig=JSON.stringify({mode:'listing',query:'daily',window:'daily',maxItems:100,languages:['overall']});
 return {bytes,archive:{repository:'example/archive',commit:'a'.repeat(40),gitBlobSha1:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
  filePath:'api/daily/all.json',fileSha256:sha(bytes),originalSourceUrl:'https://github.com/trending?since=daily',
  serializedAt:'2026-10-09T08:18:47.000Z',committedAt:'2026-10-09T08:23:18.000Z',acquiredAt:'2026-10-13T00:48:00.000Z'},
  scope:{tenantId:'00000000-0000-7000-8000-000000006101' as TenantId,workspaceId:'00000000-0000-7000-8000-000000006102' as WorkspaceId,
   interestId:'00000000-0000-7000-8000-000000006105',sourceBindingId:'00000000-0000-7000-8000-000000006111',scanPolicyId:'00000000-0000-7000-8000-000000006121'},
  bindingConfig,expectedBindingConfigSha256:sha(bindingConfig),sourceQuery:{mode:'listing' as const,query:'daily'},
  missingRepositoryNames:['example/repository1'],qualifiedSha256:'b'.repeat(64)};
};

describe('finite archived GitHub planning',()=>{
 it('selects missing identities after canonical Top10 and preserves original canonical rank/date',()=>{
  const input=fixture(),result=planGitHubArchiveQualifiedPartition(input);
  expect(result.plan.selectedCount).toBe(1);
  expect(result.plan.candidates[0]?.item.metadata?.trending).toMatchObject({rank:2,scanJobId:null,fetchStartedAt:null,checkedAt:null});
  expect(result.plan.day).toBe('2026-10-09');expect(result.productionAuthority).toBe('NONE');
  expect(planGitHubArchiveQualifiedPartition({...input,missingRepositoryNames:['EXAMPLE/REPOSITORY1']})).toEqual(result);
  expect(()=>planGitHubArchiveQualifiedPartition({...input,missingRepositoryNames:['example/repository10']})).toThrow('outside canonical Top 10');
 });
 it('rejects changed configuration, duplicate selectors and non-daily query',()=>{
  const input=fixture();
  expect(()=>planGitHubArchiveQualifiedPartition({...input,bindingConfig:'{}'})).toThrow('pin mismatch');
  expect(()=>planGitHubArchiveQualifiedPartition({...input,missingRepositoryNames:['example/repository1','EXAMPLE/REPOSITORY1']})).toThrow('unique');
  expect(()=>planGitHubArchiveQualifiedPartition({...input,sourceQuery:{mode:'listing',query:'weekly'}})).toThrow('daily binding');
 });
});
