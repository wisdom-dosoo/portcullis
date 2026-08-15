import { defineConfig } from "orval";

// Target resolution:
//   1. OPENAPI_JSON env var (e.g. a generated file path).
//   2. Fallback to the live backend's OpenAPI document at the same origin the
//      axios client uses by default, so `npm run api:generate` mostly just works
//      with the API running locally.
const target = process.env.OPENAPI_JSON ?? "http://localhost:8000/openapi.json";

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