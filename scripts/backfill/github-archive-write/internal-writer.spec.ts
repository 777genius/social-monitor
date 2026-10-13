import {closeOwnedGitHubArchiveDirectory} from './internal-writer';

describe('GitHub archive owned journal directory cleanup',()=>{
 it('closes its owned descriptor exactly once',async()=>{
  const close=jest.fn().mockResolvedValue(undefined);
  await closeOwnedGitHubArchiveDirectory({close},true,false);expect(close).toHaveBeenCalledTimes(1);
 });
 it('never closes a caller-owned descriptor',async()=>{
  const close=jest.fn().mockRejectedValue(new Error('caller-owned'));
  await closeOwnedGitHubArchiveDirectory({close},false,false);expect(close).not.toHaveBeenCalled();
 });
 it('propagates cleanup failure when there is no primary failure',async()=>{
  const failure=new Error('cleanup refused');const close=jest.fn().mockRejectedValue(failure);
  await expect(closeOwnedGitHubArchiveDirectory({close},true,false)).rejects.toBe(failure);
 });
 it('preserves the original rejection when cleanup also fails',async()=>{
  const primary=new Error('original write refused'),cleanup=new Error('cleanup refused');
  const close=jest.fn().mockRejectedValue(cleanup);
  const run=async()=>{let failed=false;try{throw primary;}catch(error){failed=true;throw error;}
   finally{await closeOwnedGitHubArchiveDirectory({close},true,failed);}};
  await expect(run()).rejects.toBe(primary);expect(close).toHaveBeenCalledTimes(1);
 });
 it('still closes its descriptor after a primary failure',async()=>{
  const close=jest.fn().mockResolvedValue(undefined);
  await closeOwnedGitHubArchiveDirectory({close},true,true);expect(close).toHaveBeenCalledTimes(1);
 });
});
