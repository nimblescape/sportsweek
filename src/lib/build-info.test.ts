/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInfo,
  buildInfoLine,
  COMMIT_VARIABLES,
  resolveCommitHash,
  SHORT_COMMIT_LENGTH,
  shortCommit,
} from "@/lib/build-info";

describe("shortCommit", () => {
  it("shortens a full sha", () => {
    expect(shortCommit("a1b2c3d4e5f60718293a4b5c6d7e8f9012345678")).toBe("a1b2c3d");
  });

  it("keeps one that is already short", () => {
    expect(shortCommit("a1b2c3d")).toBe("a1b2c3d");
  });

  it("lowercases, so two builds of one commit read alike", () => {
    expect(shortCommit("A1B2C3D")).toBe("a1b2c3d");
  });

  it("ignores surrounding whitespace, as a command's output carries a newline", () => {
    expect(shortCommit(" a1b2c3d\n")).toBe("a1b2c3d");
  });

  // A build platform that does not fill a substitution hands the placeholder on verbatim, and
  // an unresolved `$COMMIT_SHA` on screen is worse than no hash at all.
  it.each([undefined, "", "   ", "$COMMIT_SHA", "unknown", "a1b2c3", "not-a-sha"])(
    "answers nothing for %o",
    (value) => {
      expect(shortCommit(value)).toBe("");
    },
  );
});

describe("resolveCommitHash", () => {
  it("prefers what the build platform named it", () => {
    expect(resolveCommitHash({ SHORT_SHA: "a1b2c3d" }, () => "9999999")).toBe("a1b2c3d");
  });

  it("falls through the platform's names in order", () => {
    expect(
      resolveCommitHash(
        { COMMIT_SHA: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" },
        () => "9999999",
      ),
    ).toBe("a1b2c3d");
  });

  it("asks the repository when no variable answered", () => {
    expect(resolveCommitHash({}, () => "9999999")).toBe("9999999");
  });

  // Reading a repository costs a process, so a build told the commit never starts one.
  it("does not ask the repository once a variable has answered", () => {
    const fromGit = vi.fn(() => "9999999");

    resolveCommitHash({ SHORT_SHA: "a1b2c3d" }, fromGit);

    expect(fromGit).not.toHaveBeenCalled();
  });

  // A source archive carries no repository, so this is the case a deployment may well land in.
  it("answers nothing when there is neither a variable nor a repository", () => {
    expect(resolveCommitHash({}, () => undefined)).toBe("");
  });

  it("skips a variable holding an unresolved placeholder", () => {
    expect(resolveCommitHash({ SHORT_SHA: "$SHORT_SHA" }, () => "9999999")).toBe("9999999");
  });
});

describe("buildInfoLine", () => {
  it("names the version and the commit", () => {
    expect(buildInfoLine("0.1.0", "a1b2c3d")).toBe("v0.1.0 · a1b2c3d");
  });

  // Which is what a deployment looks like if the commit never reached the build.
  it("names the version alone when there is no commit", () => {
    expect(buildInfoLine("0.1.0", "")).toBe("v0.1.0");
  });

  it("says nothing at all when neither is known", () => {
    expect(buildInfoLine(undefined, undefined)).toBe("");
  });
});

describe("buildInfo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The names below are the ones next.config.ts stamps in; the test is what ties the two ends.
  it("reads what the build stamped into the bundle", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "a1b2c3d");

    expect(buildInfo()).toBe("v1.2.3 · a1b2c3d");
  });
});

describe("the constants", () => {
  it("shortens to the length git itself defaults to", () => {
    expect(SHORT_COMMIT_LENGTH).toBe(7);
  });

  it("knows the build platform's names for the commit", () => {
    expect(COMMIT_VARIABLES).toEqual(["SHORT_SHA", "COMMIT_SHA"]);
  });
});
