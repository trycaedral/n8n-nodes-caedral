import type { INodeProperties } from "n8n-workflow";

import {
  VISION_MODEL_ID,
  VOICE_MODEL_ID,
  VOICE_OPTIONS,
} from "../../shared/constants";

const AI = { show: { resource: ["ai"] } };
const AUDIO = { show: { resource: ["audio"] } };
const IMAGE = { show: { resource: ["image"] } };
const MODELS = { show: { resource: ["models"] } };
const ACCOUNT = { show: { resource: ["account"] } };

export const caedralProperties: INodeProperties[] = [
  {
    displayName: "Resource",
    name: "resource",
    type: "options",
    noDataExpression: true,
    options: [
      { name: "Account", value: "account" },
      { name: "AI", value: "ai" },
      { name: "Audio", value: "audio" },
      { name: "Image", value: "image" },
      { name: 'Model', value: "models" },
    ],
    default: "ai",
  },
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: AI,
    options: [
      {
        name: "Chat Completion",
        value: "chatCompletion",
        description: "Send a chat completion request to a Caedral chat model",
        action: "Send a chat completion",
      },
      {
        name: "Create Embedding",
        value: "createEmbedding",
        description: "Create vector embeddings for text",
        action: "Create an embedding",
      },
      {
        name: "Rerank",
        value: "rerank",
        description: "Rerank documents by relevance to a query",
        action: "Rerank documents",
      },
    ],
    default: "chatCompletion",
  },
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: AUDIO,
    options: [
      {
        name: "Generate Audio",
        value: "audioGeneration",
        description: "Generate speech audio from text",
        action: "Generate audio",
      },
    ],
    default: "audioGeneration",
  },
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: IMAGE,
    options: [
      {
        name: "Generate Image",
        value: "imageGeneration",
        description: "Generate an image from a text prompt",
        action: "Generate an image",
      },
    ],
    default: "imageGeneration",
  },
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: MODELS,
    options: [
      {
        name: "Get Model",
        value: "getModel",
        description: "Get metadata for a single model ID",
        action: "Get a model",
      },
      {
        name: "List Models",
        value: "listModels",
        description: "List all available Caedral models",
        action: "List models",
      },
    ],
    default: "listModels",
  },
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: ACCOUNT,
    options: [
      {
        name: "Get Account Info",
        value: "getAccountInfo",
        description: "Get prepaid balance and account status",
        action: "Get account info",
      },
      {
        name: "Get Usage",
        value: "getUsage",
        description: "Get prepaid balance and account status (same as Get Account Info)",
        action: "Get usage",
      },
    ],
    default: "getAccountInfo",
  },

  // --- Chat Completion ---
  {
    displayName: "Model Name or ID",
    name: "model",
    type: "options",
    typeOptions: { loadOptionsMethod: "getChatModels" },
    displayOptions: { show: { resource: ["ai"], operation: ["chatCompletion"] } },
    default: "caedral-base",
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
  },
  {
    displayName: "Message Input Mode",
    name: "messageMode",
    type: "options",
    displayOptions: { show: { resource: ["ai"], operation: ["chatCompletion"] } },
    options: [
      { name: "JSON", value: "json", description: "Full messages array as JSON" },
      { name: "Simple", value: "simple", description: "Single user message text" },
    ],
    default: "simple",
  },
  {
    displayName: "Message",
    name: "message",
    type: "string",
    typeOptions: { rows: 4 },
    displayOptions: {
      show: { resource: ["ai"], operation: ["chatCompletion"], messageMode: ["simple"] },
    },
    default: "",
    placeholder: "Explain quantum computing in one sentence",
    description: "The user message sent to the model",
  },
  {
    displayName: "Messages JSON",
    name: "messagesJson",
    type: "json",
    displayOptions: {
      show: { resource: ["ai"], operation: ["chatCompletion"], messageMode: ["json"] },
    },
    default: '[{"role":"user","content":"Hello!"}]',
    description:
      'Array of message objects. Each item needs role (system, user, assistant, or tool) and content. Example: [{"role":"user","content":"Hello"}]',
  },
  {
    displayName: "System Prompt",
    name: "systemPrompt",
    type: "string",
    typeOptions: { rows: 3 },
    displayOptions: {
      show: { resource: ["ai"], operation: ["chatCompletion"], messageMode: ["simple"] },
    },
    default: "",
    description: "Optional system message prepended before the user message",
  },
  {
    displayName: "Temperature",
    name: "temperature",
    type: "number",
    typeOptions: { minValue: 0, maxValue: 2, numberStepSize: 0.1 },
    displayOptions: { show: { resource: ["ai"], operation: ["chatCompletion"] } },
    default: 1,
    description: 'Sampling temperature (0–2). The default 1 is omitted from the request.',
  },
  {
    displayName: "Max Tokens",
    name: "maxTokens",
    type: "number",
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ["ai"], operation: ["chatCompletion"] } },
    default: 0,
    description: 'Maximum tokens to generate. Set to 0 to omit from the request.',
  },
  {
    displayName: "Options",
    name: "chatOptions",
    type: "collection",
    placeholder: "Add Option",
    default: {},
    displayOptions: { show: { resource: ["ai"], operation: ["chatCompletion"] } },
    options: [
      {
        displayName: "Frequency Penalty",
        name: "frequencyPenalty",
        type: "number",
        typeOptions: { minValue: -2, maxValue: 2, numberStepSize: 0.1 },
        default: 0,
        description: 'Frequency penalty (-2 to 2). Omitted when 0.',
      },
      {
        displayName: "Presence Penalty",
        name: "presencePenalty",
        type: "number",
        typeOptions: { minValue: -2, maxValue: 2, numberStepSize: 0.1 },
        default: 0,
        description: 'Presence penalty (-2 to 2). Omitted when 0.',
      },
      {
        displayName: "Response Format",
        name: "responseFormat",
        type: "options",
        options: [
          { name: "JSON Object", value: "json_object" },
          { name: "Text", value: "text" },
        ],
        default: "text",
        description: "Structured JSON mode when the model supports it",
      },
      {
        displayName: "Stop Sequences",
        name: "stop",
        type: "string",
        default: "",
        placeholder: "END, STOP",
        description: "Comma-separated stop sequences",
      },
      {
        displayName: "Tool Choice",
        name: "toolChoice",
        type: "options",
        options: [
          { name: "Auto", value: "auto" },
          { name: "None", value: "none" },
          { name: "Required", value: "required" },
        ],
        default: "auto",
        description: "How the model should choose tools when Tools JSON is set",
      },
      {
        displayName: "Tools JSON",
        name: "toolsJson",
        type: "json",
        default: "",
        description:
          'Optional OpenAI-style tools array, e.g. [{"type":"function","function":{"name":"search","parameters":{}}}]',
      },
      {
        displayName: "Top P",
        name: "topP",
        type: "number",
        typeOptions: { minValue: 0, maxValue: 1, numberStepSize: 0.05 },
        default: 0,
        description: 'Nucleus sampling. Set to 0 to omit from the request.',
      },
      {
        displayName: "User",
        name: "user",
        type: "string",
        default: "",
        description: "End-user identifier for your own abuse tracking",
      },
    ],
  },

  // --- Embeddings ---
  {
    displayName: "Model Name or ID",
    name: "embeddingModel",
    type: "options",
    typeOptions: { loadOptionsMethod: "getEmbeddingModels" },
    displayOptions: { show: { resource: ["ai"], operation: ["createEmbedding"] } },
    default: "caedral-embed-e1-small-v1",
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
  },
  {
    displayName: "Input",
    name: "embeddingInput",
    type: "string",
    typeOptions: { rows: 4 },
    displayOptions: { show: { resource: ["ai"], operation: ["createEmbedding"] } },
    default: "",
    required: true,
    placeholder: "The quick brown fox jumps over the lazy dog",
    description: 'Text to embed. For a batch, provide a JSON array of strings.',
  },
  {
    displayName: "Input Type",
    name: "embeddingInputType",
    type: "options",
    displayOptions: { show: { resource: ["ai"], operation: ["createEmbedding"] } },
    options: [
      { name: "Document", value: "document" },
      { name: "Query", value: "query" },
    ],
    default: "document",
    description: "Retrieval-aware prefixing sent as input_type",
  },
  {
    displayName: "Encoding Format",
    name: "embeddingEncodingFormat",
    type: "options",
    displayOptions: { show: { resource: ["ai"], operation: ["createEmbedding"] } },
    options: [
      { name: "Base64", value: "base64" },
      { name: "Float", value: "float" },
    ],
    default: "float",
    description: "Response encoding from POST /v1/embeddings",
  },

  // --- Rerank ---
  {
    displayName: "Model Name or ID",
    name: "rerankModel",
    type: "options",
    typeOptions: { loadOptionsMethod: "getRerankModels" },
    displayOptions: { show: { resource: ["ai"], operation: ["rerank"] } },
    default: "caedral-rerank",
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
  },
  {
    displayName: "Query",
    name: "rerankQuery",
    type: "string",
    typeOptions: { rows: 2 },
    displayOptions: { show: { resource: ["ai"], operation: ["rerank"] } },
    default: "",
    required: true,
    placeholder: "What is the capital of France?",
    description: "The search query to rank documents against",
  },
  {
    displayName: "Documents",
    name: "rerankDocuments",
    type: "json",
    displayOptions: { show: { resource: ["ai"], operation: ["rerank"] } },
    default: '["Paris is the capital of France.", "Berlin is in Germany."]',
    required: true,
    description: "JSON array of document strings to rerank (maximum 100)",
  },
  {
    displayName: "Top N",
    name: "rerankTopN",
    type: "number",
    typeOptions: { minValue: 1, maxValue: 100 },
    displayOptions: { show: { resource: ["ai"], operation: ["rerank"] } },
    default: 5,
    description: "Maximum number of documents to return after reranking",
  },
  {
    displayName: "Minimum Score",
    name: "rerankMinScore",
    type: "number",
    typeOptions: { minValue: 0, maxValue: 1, numberStepSize: 0.05 },
    displayOptions: { show: { resource: ["ai"], operation: ["rerank"] } },
    default: 0,
    description: 'Only return documents with a relevance score above this threshold. 0 = no filtering.',
  },

  // --- Image ---
  {
    displayName: "Model Name or ID",
    name: "imageModel",
    type: "options",
    typeOptions: { loadOptionsMethod: "getImageModels" },
    displayOptions: { show: { resource: ["image"], operation: ["imageGeneration"] } },
    default: VISION_MODEL_ID,
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
  },
  {
    displayName: "Prompt",
    name: "imagePrompt",
    type: "string",
    typeOptions: { rows: 4 },
    displayOptions: { show: { resource: ["image"], operation: ["imageGeneration"] } },
    default: "",
    required: true,
    placeholder: "A futuristic city skyline at sunset, digital art",
    description: "Text description of the image to generate",
  },
  {
    displayName: "Size",
    name: "imageSize",
    type: "options",
    displayOptions: { show: { resource: ["image"], operation: ["imageGeneration"] } },
    options: [
      { name: "1024x1024", value: "1024x1024" },
      { name: "1024x1792", value: "1024x1792" },
      { name: "1792x1024", value: "1792x1024" },
    ],
    default: "1024x1024",
    description: "Requested dimensions, forwarded to Caedral Vision",
  },
  {
    displayName: "Number of Images",
    name: "imageN",
    type: "number",
    typeOptions: { minValue: 1, maxValue: 4 },
    displayOptions: { show: { resource: ["image"], operation: ["imageGeneration"] } },
    default: 1,
    description: 'Number of images to request (1–4). The current gateway may still return a single image.',
  },

  // --- Audio ---
  {
    displayName: "Model Name or ID",
    name: "audioModel",
    type: "options",
    typeOptions: { loadOptionsMethod: "getAudioModels" },
    displayOptions: { show: { resource: ["audio"], operation: ["audioGeneration"] } },
    default: VOICE_MODEL_ID,
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
  },
  {
    displayName: "Input Text",
    name: "audioInput",
    type: "string",
    typeOptions: { rows: 4 },
    displayOptions: { show: { resource: ["audio"], operation: ["audioGeneration"] } },
    default: "",
    required: true,
    placeholder: "Welcome to Caedral, the unified AI platform",
    description: "Text to convert to speech",
  },
  {
    displayName: "Voice",
    name: "audioVoice",
    type: "options",
    displayOptions: { show: { resource: ["audio"], operation: ["audioGeneration"] } },
    options: [...VOICE_OPTIONS],
    default: "alloy",
    description: "Voice style forwarded to Caedral Voice (default alloy)",
  },
  {
    displayName: "Custom Voice",
    name: "audioVoiceCustom",
    type: "string",
    displayOptions: {
      show: { resource: ["audio"], operation: ["audioGeneration"], audioVoice: ["custom"] },
    },
    default: "",
    placeholder: "alloy",
    description: "Custom voice identifier when Voice is set to Custom",
  },

  // --- Models ---
  {
    displayName: "Model Name or ID",
    name: "modelId",
    type: "options",
    typeOptions: { loadOptionsMethod: "getCatalogModels" },
    displayOptions: { show: { resource: ["models"], operation: ["getModel"] } },
    default: "caedral-titan",
    description:
      'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
  },
];
