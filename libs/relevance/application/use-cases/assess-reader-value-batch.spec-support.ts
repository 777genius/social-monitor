import type { ReaderValueAssessment, ReaderValueScoringOutcome } from '../contracts/reader-value-assessment-store';
import { readerValueLabels, validateReaderValueAnswers } from '../../domain/reader-value/reader-value-assessment';

export function assessmentClaim(id='assessment'):ReaderValueAssessment {
  return {
    id,state:'running',attempts:1,leaseToken:'lease',leaseUntil:'2026-09-20T00:01:30Z',assessedAt:null,
    answers:null,usageUnknown:false,costUsd:null,errorCode:null,input:{
      tenantId:'tenant',workspaceId:'workspace',interestId:'interest',sourceItemId:'source',sourceRevisionKey:'revision',
      sourceSnapshotSha256:'source-digest',interestSha256:'interest-digest',rubricVersion:'fixture.v1',rubricSha256:'rubric-digest',
      inputBuilderVersion:'fixture.v1',modelConfigVersion:'fixture.v1',inputSha256:'input-digest',requestSha256:'request-digest',
      requestedModel:'fixture',requestBody:'{}',snapshot:{
        sourceSnapshotSha256:'source-digest',interestSha256:'interest-digest',sanitizedTextSha256:'text-digest',
        title:'title',body:'body',interest:'interest',capture:{representationVersion:'fixture.v1',availability:'complete',segments:[]},
        availableAt:'2026-09-20T00:00:00Z',originalTitleLength:5,originalBodyLength:4,retainedSnapshotTruncated:false,safety:'allowed',
      },
    },
  };
}
export function scoringSuccess():ReaderValueScoringOutcome {
  const result=validateReaderValueAnswers(Object.fromEntries(Object.entries(readerValueLabels).map(([criterion,labels])=>[criterion,{
    choice:labels[0],confidence:0.9,probabilities:Object.fromEntries(labels.map((label,index)=>[label,index===0?1:0])),
  }])));
  if (!result.ok) throw new Error('Invalid fixture');
  return {ok:true,answers:result.value,execution:{requestId:null,resolvedModel:'fixture',provider:'fixture',latencyMs:1,
    inputTokens:null,outputTokens:null,costUsd:null,usageUnknown:true}};
}
