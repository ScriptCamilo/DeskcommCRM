import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

describe("alcance publico do setup inicial", () => {
  it.each(["/setup", "/api/v1/setup/session", "/api/v1/setup/complete"])(
    "deixa %s chegar ao guard proprio",
    (path) => expect(isPublicPath(path)).toBe(true),
  );

  it.each(["/setup/extra", "/api/v1/setup", "/api/v1/setup/session/extra"])(
    "nao torna %s publico por prefixo",
    (path) => expect(isPublicPath(path)).toBe(false),
  );
});
