import { bindInheritedDirectoryPath } from
  "./reader-summary-inherited-directory-path";

describe("bindInheritedDirectoryPath", () => {
  it("keeps an inherited directory reachable by nested child processes", () => {
    expect(bindInheritedDirectoryPath("/proc/self/fd/10", 85)).toBe(
      "/proc/85/fd/10",
    );
    expect(bindInheritedDirectoryPath("/proc/self/fd/10/quality", 85)).toBe(
      "/proc/85/fd/10/quality",
    );
  });

  it("leaves ordinary artifact paths unchanged", () => {
    expect(bindInheritedDirectoryPath("/var/data/artifacts", 85)).toBe(
      "/var/data/artifacts",
    );
  });
});
