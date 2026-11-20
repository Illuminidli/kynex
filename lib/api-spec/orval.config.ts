import { defineConfig } from "orval";

// Generates two things from openapi.yaml:
// 1. React Query hooks the screens use to call the server.
// 2. Zod validators the server uses to check what it sends and receives.
export default defineConfig({
  client: {
    input: "./openapi.yaml",
    output: {
      target: "../api-client-react/src/generated/api.ts",
      client: "react-query",
      httpClient: "fetch",
      mode: "single",
      baseUrl: "/api",
      clean: true,
      override: { query: { version: 5 } },
    },
  },
  zod: {
    input: "./openapi.yaml",
    output: {
      target: "../api-zod/src/generated/api.ts",
      client: "zod",
      mode: "single",
      clean: true,
    },
  },
});
