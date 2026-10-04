import { defineConfig } from "orval";

// P1: generate from the checked-in spec to prevent drift.
// Previously `http://localhost:8000/openapi.json` guaranteed that
// api/openapi.json, api/openapi_new.json, web/openapi.json, and
// src/api/generated.ts diverged (ssl_*/bridge_*/audit filters were stale).
// Regenerate with: OPENAPI_JSON=../api/openapi.json npm run api:generate
const target = process.env.OPENAPI_JSON ?? "./openapi.json";

export default defineConfig({
  portcullis: {
    input: {
      target,
    },
    output: {
      target: "./src/api/generated.ts",
      client: "react-query",
      override: {
        mutator: {
          path: "./src/lib/axios-instance.ts",
          name: "axiosInstance",
        },
      },
    },
  },
});