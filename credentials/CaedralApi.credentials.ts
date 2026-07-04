import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

import { DEFAULT_BASE_URL } from "../shared/constants";

/**
 * n8n credential type for the Caedral API.
 *
 * Collects the user's `apiKey` (stored securely as a password
 * field) and an optional `baseUrl` override for self-hosted or
 * local deployments. The `test` request validates the credentials
 * by hitting `GET /v1/usage`, which requires a valid API key.
 */
export class CaedralApi implements ICredentialType {
  name = "caedralApi";

  displayName = "Caedral API";

  documentationUrl = "https://caedral.com/docs";

  icon = {
    light: "file:../../icons/caedral.svg",
    dark: "file:../../icons/caedral.dark.svg",
  } as const;

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
        Accept: "application/json",
      },
    },
  };

  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      placeholder: "cd_live_...",
      description: "Your Caedral API key from the dashboard",
    },
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      default: DEFAULT_BASE_URL,
      description:
        "Caedral API gateway URL. Use http://localhost:5001 for local development.",
    },
  ];

  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials.baseUrl}}",
      url: "/v1/usage",
      method: "GET",
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
        Accept: "application/json",
      },
    },
  };
}
