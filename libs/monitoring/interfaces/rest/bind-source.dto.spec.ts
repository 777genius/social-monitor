import { normalizeSourceBindingConfig } from "./bind-source.dto";

describe("normalizeSourceBindingConfig", () => {
  it.each(["owner", "admin"])(
    "does not let a workspace %s persist a self-attested X authority handle",
    () => {
      expect(normalizeSourceBindingConfig({
        mode: "search",
        query: "agents",
        promotionAuthorityHandles: ["arbitrary_workspace_handle"],
      })).toEqual({ mode: "search", query: "agents" });
    },
  );

  it("removes nested authority input instead of preserving a hidden trust path", () => {
    expect(normalizeSourceBindingConfig({
      provider: {
        promotionAuthorityHandles: ["arbitrary_workspace_handle"],
        query: "agents",
      },
    })).toEqual({ provider: { query: "agents" } });
  });
});
