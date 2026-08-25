import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `globals` is off in vitest.config.ts, so RTL's auto-cleanup never registers itself
// and rendered DOM would otherwise leak from one test into the next.
afterEach(cleanup);
