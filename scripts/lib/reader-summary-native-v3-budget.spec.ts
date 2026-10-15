import { nativeV3ModelPreparationBudget, requireNativeV3ModelPreparationBudget } from './reader-summary-native-v3-budget';
import { resolveAgentRuntimePromotionPresentationV3BuilderOptions } from '@social-monitor/summary/adapters/model/agent-runtime-promotion-presentation-v3.builder';
import { resolveAgentRuntimeReaderSummaryModelOptions } from '@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter';
import { resolveAgentRuntimeReaderSummaryTopicLabelerOptions } from '@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-labeler.adapter';
import { resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions } from '@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-relation-verifier.adapter';
import type { AgentRuntimeClientPort } from '@social-monitor/summary/ports';
const client={runTask:jest.fn()} as unknown as AgentRuntimeClientPort;
const configured=(extra:NodeJS.ProcessEnv={})=>{
 const env={AGENT_RUNTIME_READER_SUMMARY_BACKEND:'xiaomi-mimo-token-plan',AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL:'mimo-v2.6-pro',...extra};
 return {presentation:resolveAgentRuntimePromotionPresentationV3BuilderOptions(env,client),
  narrative:resolveAgentRuntimeReaderSummaryModelOptions(env,client),topics:{
   label:resolveAgentRuntimeReaderSummaryTopicLabelerOptions(env,client),
   relation:resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(env,client)}};
};
describe('Native V3 resolved model/preparation subtotal',()=>{
 it('derives defaults including all sequential calls, repair paths and gRPC grace',()=>{
  expect(nativeV3ModelPreparationBudget(configured())).toBe(6_010_000);
  expect(()=>requireNativeV3ModelPreparationBudget(420_000,configured())).toThrow('owner budget');
  expect(()=>requireNativeV3ModelPreparationBudget(6_010_000,configured())).toThrow('owner budget');
  expect(client.runTask).not.toHaveBeenCalled();
 });
 it('uses actual purpose overrides and relation fallback to label timeout without clipping',()=>{
  const opts=configured({AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS:'1200000',AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS:'900000'});
  expect(opts.topics.relation.timeoutMs).toBe(900000);
  expect(nativeV3ModelPreparationBudget(opts)).toBe(9_010_000);
 });
 it('accounts only enabled topic path and enforces MiMo presentation cap',()=>{
  const opts=configured({AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_TIMEOUT_MS:'900000'});
  expect(nativeV3ModelPreparationBudget({presentation:opts.presentation,narrative:opts.narrative})).toBe(4_190_000);
 });
 it('refuses invalid or overflowing resolved task timeouts',()=>{
  const opts=configured();
  for(const timeoutMs of [0,-1,Infinity,Number.MAX_SAFE_INTEGER])
   expect(()=>nativeV3ModelPreparationBudget({...opts,narrative:{...opts.narrative,timeoutMs}})).toThrow();
 });
});
