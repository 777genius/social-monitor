export const bindInheritedDirectoryPath = (
  path: string,
  ownerPid = process.pid,
): string => path.replace(
  /^\/proc\/self\/fd\/(\d+)(?=\/|$)/u,
  `/proc/${ownerPid}/fd/$1`,
);
