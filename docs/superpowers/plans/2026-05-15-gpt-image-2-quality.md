# GPT Image 2 Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add high-quality, officially-compatible GPT Image defaults to LibreChat's OpenAI agent image tools.

**Architecture:** Keep the existing `image_gen_oai` and `image_edit_oai` tools. Add a small option-resolution layer in `OpenAIImageTools.js` that merges explicit tool arguments, environment defaults, and existing safe fallbacks, then reuse it for generation and editing. Preserve existing artifact, quota, and UI behavior while adding multiple-image response support.

**Tech Stack:** Node.js CommonJS backend, OpenAI SDK `5.8.2`, Axios multipart edit requests, LangChain tools, Jest tests under `api/test`.

---

## File Structure

- Modify: `api/app/clients/tools/structured/OpenAIImageTools.js`
  - Add option normalization helpers near the current `createAbortHandler`.
  - Use helpers in `image_gen_oai` and `image_edit_oai`.
  - Convert OpenAI image response data into multiple artifacts and file IDs.
- Modify: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`
  - Expand current model-only tests into generation, defaults, multi-image, and edit coverage.
  - Mock `axios.post`, `form-data`, file strategy downloads, and `uuid`.
- Modify: `.env.example`
  - Document the high-quality defaults.
- No changes expected in `packages/api/src/tools/toolkits/oai.ts`
  - The existing schema already exposes the current public fields: `prompt`, `background`, `quality`, and `size`.

## Task 1: Test High-Quality Generation Defaults

**Files:**
- Modify: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`
- Test: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`

- [ ] **Step 1: Replace the current test setup with reusable mocks**

Update the top of `api/test/app/clients/tools/structured/OpenAIImageTools.test.js` so it includes these imports and mocks:

```js
const axios = require('axios');
const OpenAI = require('openai');
const { Readable } = require('stream');
const createOpenAIImageTools = require('~/app/clients/tools/structured/OpenAIImageTools');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

jest.mock('axios');
jest.mock('openai');
jest.mock('uuid', () => ({
  v4: jest
    .fn()
    .mockReturnValueOnce('generated-file-1')
    .mockReturnValueOnce('generated-file-2')
    .mockReturnValue('generated-file-next'),
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(),
  oaiToolkit: {
    image_gen_oai: {
      name: 'image_gen_oai',
      description: 'Generate an image',
      schema: {},
    },
    image_edit_oai: {
      name: 'image_edit_oai',
      description: 'Edit an image',
      schema: {},
    },
  },
  extractBaseURL: jest.fn((url) => url),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/models', () => ({
  getFiles: jest.fn().mockResolvedValue([]),
}));
```

- [ ] **Step 2: Add shared test helpers**

Add these helpers below the mocks:

```js
const createReq = () => ({ user: { id: 'test-user' } });

const createTools = (fields = {}) =>
  createOpenAIImageTools({
    isAgent: true,
    override: false,
    req: createReq(),
    imageOutputType: 'png',
    ...fields,
  });

const mockGenerate = (data = [{ b64_json: 'base64-encoded-image-data' }]) => {
  const generate = jest.fn().mockResolvedValue({ data });
  OpenAI.mockImplementation(() => ({
    images: {
      generate,
    },
  }));
  return generate;
};

const mockEditRequest = (data = [{ b64_json: 'edited-base64-image-data' }]) => {
  axios.post.mockResolvedValue({ data: { data } });
};
```

- [ ] **Step 3: Update the describe setup**

Replace the existing `describe('OpenAIImageTools - IMAGE_GEN_OAI_MODEL environment variable', ...)` wrapper with:

```js
describe('OpenAIImageTools', () => {
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.IMAGE_GEN_OAI_API_KEY = 'test-api-key';
    delete process.env.IMAGE_GEN_OAI_MODEL;
    delete process.env.IMAGE_GEN_OAI_QUALITY;
    delete process.env.IMAGE_GEN_OAI_SIZE;
    delete process.env.IMAGE_GEN_OAI_BACKGROUND;
    delete process.env.IMAGE_GEN_OAI_OUTPUT_FORMAT;
    delete process.env.IMAGE_GEN_OAI_OUTPUT_COMPRESSION;
    mockGenerate();
    mockEditRequest();
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from(Buffer.from('image'))),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });
```

Keep the final closing `});` at the end of the file.

- [ ] **Step 4: Add the failing generation-defaults tests**

Inside the new `describe`, add:

```js
  describe('generation options', () => {
    it('uses default model "gpt-image-1" when IMAGE_GEN_OAI_MODEL is not set', async () => {
      const generate = mockGenerate();
      const [imageGenTool] = createTools();

      await imageGenTool.func({ prompt: 'test prompt' });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-image-1',
          quality: 'auto',
          size: 'auto',
          background: 'auto',
          output_format: 'png',
          output_compression: undefined,
        }),
        expect.any(Object),
      );
    });

    it('passes through IMAGE_GEN_OAI_MODEL=gpt-image-2 without private parameters', async () => {
      process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-2';
      const generate = mockGenerate();
      const [imageGenTool] = createTools();

      await imageGenTool.func({ prompt: 'test prompt' });

      const request = generate.mock.calls[0][0];
      expect(request).toEqual(
        expect.objectContaining({
          model: 'gpt-image-2',
          prompt: 'test prompt',
          n: 1,
          background: 'auto',
          output_format: 'png',
          quality: 'auto',
          size: 'auto',
        }),
      );
      expect(Object.keys(request).sort()).toEqual([
        'background',
        'model',
        'n',
        'output_compression',
        'output_format',
        'prompt',
        'quality',
        'size',
      ]);
    });

    it('applies environment defaults for quality, size, background, format, and compression', async () => {
      process.env.IMAGE_GEN_OAI_QUALITY = 'high';
      process.env.IMAGE_GEN_OAI_SIZE = '1024x1024';
      process.env.IMAGE_GEN_OAI_BACKGROUND = 'opaque';
      process.env.IMAGE_GEN_OAI_OUTPUT_FORMAT = 'webp';
      process.env.IMAGE_GEN_OAI_OUTPUT_COMPRESSION = '95';
      const generate = mockGenerate();
      const [imageGenTool] = createTools();

      await imageGenTool.func({ prompt: 'test prompt' });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 'high',
          size: '1024x1024',
          background: 'opaque',
          output_format: 'webp',
          output_compression: 95,
        }),
        expect.any(Object),
      );
    });

    it('lets explicit tool arguments override environment defaults', async () => {
      process.env.IMAGE_GEN_OAI_QUALITY = 'high';
      process.env.IMAGE_GEN_OAI_SIZE = '1024x1024';
      process.env.IMAGE_GEN_OAI_BACKGROUND = 'opaque';
      process.env.IMAGE_GEN_OAI_OUTPUT_FORMAT = 'webp';
      process.env.IMAGE_GEN_OAI_OUTPUT_COMPRESSION = '95';
      const generate = mockGenerate();
      const [imageGenTool] = createTools();

      await imageGenTool.func({
        prompt: 'test prompt',
        quality: 'low',
        size: '1536x1024',
        background: 'transparent',
        output_compression: 40,
      });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 'low',
          size: '1536x1024',
          background: 'transparent',
          output_format: 'webp',
          output_compression: 40,
        }),
        expect.any(Object),
      );
    });

    it('clamps n and output compression', async () => {
      process.env.IMAGE_GEN_OAI_OUTPUT_FORMAT = 'jpeg';
      process.env.IMAGE_GEN_OAI_OUTPUT_COMPRESSION = '500';
      const generate = mockGenerate();
      const [imageGenTool] = createTools();

      await imageGenTool.func({
        prompt: 'test prompt',
        n: 20,
        output_compression: -10,
      });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          n: 10,
          output_format: 'jpeg',
          output_compression: 0,
        }),
        expect.any(Object),
      );
    });
  });
```

- [ ] **Step 5: Run the targeted test and verify it fails**

Run:

```bash
cd api && npx jest test/app/clients/tools/structured/OpenAIImageTools.test.js --runInBand
```

Expected: FAIL. Failures should mention missing env default handling, missing `output_format` argument support, or mismatched request payload.

## Task 2: Implement Option Resolution for Generation

**Files:**
- Modify: `api/app/clients/tools/structured/OpenAIImageTools.js`
- Test: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`

- [ ] **Step 1: Add constants and helpers**

In `api/app/clients/tools/structured/OpenAIImageTools.js`, add this block after `createAbortHandler`:

```js
const IMAGE_QUALITIES = new Set(['auto', 'high', 'medium', 'low']);
const IMAGE_BACKGROUNDS = new Set(['transparent', 'opaque', 'auto']);
const IMAGE_SIZES = new Set(['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512']);
const IMAGE_OUTPUT_FORMATS = new Set([
  EImageOutputType.PNG,
  EImageOutputType.WEBP,
  EImageOutputType.JPEG,
]);

function resolveEnumOption({ value, envValue, fallback, allowed, name }) {
  const candidate = value ?? envValue ?? fallback;
  if (allowed.has(candidate)) {
    return candidate;
  }

  logger.warn(`[ImageGenOAI] Invalid ${name} value "${candidate}", defaulting to "${fallback}"`);
  return fallback;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(min, Math.trunc(parsed)), max);
}

function resolveOutputFormat({ value, envValue, fallback }) {
  return resolveEnumOption({
    value,
    envValue,
    fallback,
    allowed: IMAGE_OUTPUT_FORMATS,
    name: 'output format',
  });
}

function resolveImageOptions({
  background,
  n,
  output_compression,
  output_format,
  quality,
  size,
  fallbackOutputFormat,
}) {
  const resolvedBackground = resolveEnumOption({
    value: background,
    envValue: process.env.IMAGE_GEN_OAI_BACKGROUND,
    fallback: 'auto',
    allowed: IMAGE_BACKGROUNDS,
    name: 'background',
  });
  const resolvedQuality = resolveEnumOption({
    value: quality,
    envValue: process.env.IMAGE_GEN_OAI_QUALITY,
    fallback: 'auto',
    allowed: IMAGE_QUALITIES,
    name: 'quality',
  });
  const resolvedSize = resolveEnumOption({
    value: size,
    envValue: process.env.IMAGE_GEN_OAI_SIZE,
    fallback: 'auto',
    allowed: IMAGE_SIZES,
    name: 'size',
  });

  let resolvedOutputFormat = resolveOutputFormat({
    value: output_format,
    envValue: process.env.IMAGE_GEN_OAI_OUTPUT_FORMAT,
    fallback: fallbackOutputFormat,
  });
  if (
    resolvedBackground === 'transparent' &&
    resolvedOutputFormat !== EImageOutputType.PNG &&
    resolvedOutputFormat !== EImageOutputType.WEBP
  ) {
    logger.warn(
      '[ImageGenOAI] Transparent background requires PNG or WebP format, defaulting to PNG',
    );
    resolvedOutputFormat = EImageOutputType.PNG;
  }

  const resolvedCompression = clampInteger(
    output_compression,
    clampInteger(process.env.IMAGE_GEN_OAI_OUTPUT_COMPRESSION, 100, 0, 100),
    0,
    100,
  );

  return {
    background: resolvedBackground,
    n: clampInteger(n, 1, 1, 10),
    output_format: resolvedOutputFormat,
    output_compression:
      resolvedOutputFormat === EImageOutputType.WEBP ||
      resolvedOutputFormat === EImageOutputType.JPEG
        ? resolvedCompression
        : undefined,
    quality: resolvedQuality,
    size: resolvedSize,
  };
}

function createImageArtifacts(data, outputFormat) {
  const content = [];
  const file_ids = [];
  const generatedIds = [];

  for (const item of data ?? []) {
    const base64Image = item?.b64_json;
    if (!base64Image) {
      continue;
    }

    const fileId = v4();
    file_ids.push(fileId);
    generatedIds.push(fileId);
    content.push({
      type: ContentTypes.IMAGE_URL,
      image_url: {
        url: `data:image/${outputFormat};base64,${base64Image}`,
      },
    });
  }

  return { content, file_ids, generatedIds };
}

function createGeneratedImageText(generatedIds, referencedIds = []) {
  const generatedText =
    generatedIds.length === 1
      ? `generated_image_id: "${generatedIds[0]}"`
      : `generated_image_ids: ["${generatedIds.join('", "')}"]`;
  const referencedText = referencedIds.length
    ? `\nreferenced_image_ids: ["${referencedIds.join('", "')}"]`
    : '';

  return displayMessage + `\n\n${generatedText}${referencedText}`;
}
```

- [ ] **Step 2: Update the generation function signature**

In the `imageGenTool` callback parameter destructuring, replace:

```js
{
  prompt,
  background = 'auto',
  n = 1,
  output_compression = 100,
  quality = 'auto',
  size = 'auto',
},
```

with:

```js
{
  prompt,
  background,
  n,
  output_compression,
  output_format,
  quality,
  size,
},
```

- [ ] **Step 3: Replace inline generation option handling**

In the generation tool, replace the `let output_format = imageOutputType;` block and transparent-background check with:

```js
      const imageOptions = resolveImageOptions({
        background,
        n,
        output_compression,
        output_format,
        quality,
        size,
        fallbackOutputFormat: imageOutputType,
      });
```

Then replace the `openai.images.generate` request object with:

```js
          {
            model: imageModel,
            prompt: replaceUnwantedChars(prompt),
            ...imageOptions,
          },
```

- [ ] **Step 4: Replace single-image artifact handling**

Replace this block:

```js
      const base64Image = resp.data[0].b64_json;

      if (!base64Image) {
        return returnValue(
          'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
        );
      }

      const content = [
        {
          type: ContentTypes.IMAGE_URL,
          image_url: {
            url: `data:image/${output_format};base64,${base64Image}`,
          },
        },
      ];

      const file_ids = [v4()];
      const response = [
        {
          type: ContentTypes.TEXT,
          text: displayMessage + `\n\ngenerated_image_id: "${file_ids[0]}"`,
        },
      ];
      return [response, { content, file_ids }];
```

with:

```js
      const { content, file_ids, generatedIds } = createImageArtifacts(
        resp.data,
        imageOptions.output_format,
      );

      if (!content.length) {
        return returnValue(
          'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
        );
      }

      const response = [
        {
          type: ContentTypes.TEXT,
          text: createGeneratedImageText(generatedIds),
        },
      ];
      return [response, { content, file_ids }];
```

- [ ] **Step 5: Run generation tests**

Run:

```bash
cd api && npx jest test/app/clients/tools/structured/OpenAIImageTools.test.js --runInBand
```

Expected: the generation options tests pass. Edit and multi-image tests may still be absent or failing until later tasks.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add api/app/clients/tools/structured/OpenAIImageTools.js api/test/app/clients/tools/structured/OpenAIImageTools.test.js
git commit -m "feat: add openai image option defaults"
```

## Task 3: Test and Implement Multiple Generation Results

**Files:**
- Modify: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`
- Modify: `api/app/clients/tools/structured/OpenAIImageTools.js`

- [ ] **Step 1: Add the failing multi-image test**

Inside `describe('generation options', ...)`, add:

```js
    it('returns multiple image artifacts and generated image IDs', async () => {
      mockGenerate([{ b64_json: 'first-image' }, { b64_json: 'second-image' }]);
      const [imageGenTool] = createTools();

      const [response, artifact] = await imageGenTool.func({
        prompt: 'test prompt',
        n: 2,
      });

      expect(artifact.file_ids).toEqual(['generated-file-1', 'generated-file-2']);
      expect(artifact.content).toEqual([
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,first-image',
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,second-image',
          },
        },
      ]);
      expect(response[0].text).toContain(
        'generated_image_ids: ["generated-file-1", "generated-file-2"]',
      );
    });
```

- [ ] **Step 2: Run the targeted test**

Run:

```bash
cd api && npx jest test/app/clients/tools/structured/OpenAIImageTools.test.js --runInBand
```

Expected: PASS if Task 2 already implemented `createImageArtifacts`; otherwise FAIL on only one returned artifact.

- [ ] **Step 3: Implement missing multi-image behavior if needed**

If the test failed, verify `createImageArtifacts` uses a `for...of` over `data ?? []` and that generation calls:

```js
const { content, file_ids, generatedIds } = createImageArtifacts(
  resp.data,
  imageOptions.output_format,
);
```

Then rerun the test.

- [ ] **Step 4: Commit Task 3**

Run:

```bash
git add api/app/clients/tools/structured/OpenAIImageTools.js api/test/app/clients/tools/structured/OpenAIImageTools.test.js
git commit -m "feat: return multiple openai image artifacts"
```

If Task 2 already committed the implementation and this task only adds the test, commit only the test file with the same message.

## Task 4: Test and Implement Edit Defaults

**Files:**
- Modify: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`
- Modify: `api/app/clients/tools/structured/OpenAIImageTools.js`

- [ ] **Step 1: Add edit tests**

Add this `describe` block inside the top-level `describe('OpenAIImageTools', ...)`:

```js
  describe('edit options', () => {
    it('applies the same quality and size environment defaults to image edits', async () => {
      process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-2';
      process.env.IMAGE_GEN_OAI_QUALITY = 'high';
      process.env.IMAGE_GEN_OAI_SIZE = '1024x1024';
      const [, imageEditTool] = createTools({
        imageFiles: [
          {
            file_id: 'source-image',
            filepath: '/tmp/source.png',
            filename: 'source.png',
            type: 'image/png',
            source: 'local',
          },
        ],
      });

      await imageEditTool.func({
        prompt: 'make it sharper',
        image_ids: ['source-image'],
      });

      const formData = axios.post.mock.calls[0][1];
      expect(formData._streams.join('\n')).toContain('gpt-image-2');
      expect(formData._streams.join('\n')).toContain('high');
      expect(formData._streams.join('\n')).toContain('1024x1024');
    });

    it('lets explicit edit quality and size override environment defaults', async () => {
      process.env.IMAGE_GEN_OAI_QUALITY = 'high';
      process.env.IMAGE_GEN_OAI_SIZE = '1024x1024';
      const [, imageEditTool] = createTools({
        imageFiles: [
          {
            file_id: 'source-image',
            filepath: '/tmp/source.png',
            filename: 'source.png',
            type: 'image/png',
            source: 'local',
          },
        ],
      });

      await imageEditTool.func({
        prompt: 'make it sharper',
        image_ids: ['source-image'],
        quality: 'medium',
        size: '1536x1024',
      });

      const formData = axios.post.mock.calls[0][1];
      expect(formData._streams.join('\n')).toContain('medium');
      expect(formData._streams.join('\n')).toContain('1536x1024');
    });
  });
```

- [ ] **Step 2: Run edit tests and verify they fail**

Run:

```bash
cd api && npx jest test/app/clients/tools/structured/OpenAIImageTools.test.js --runInBand
```

Expected: FAIL because `image_edit_oai` currently defaults directly to `auto` and does not read env defaults.

- [ ] **Step 3: Update edit function signature**

In `OpenAIImageTools.js`, replace:

```js
async ({ prompt, image_ids, quality = 'auto', size = 'auto' }, runnableConfig) => {
```

with:

```js
async ({ prompt, image_ids, quality, size }, runnableConfig) => {
```

- [ ] **Step 4: Resolve edit defaults before appending form fields**

After the proxy client config block and before `const formData = new FormData();`, add:

```js
      const imageOptions = resolveImageOptions({
        quality,
        size,
        fallbackOutputFormat: imageOutputType,
      });
```

Then replace:

```js
formData.append('quality', quality);
formData.append('size', size);
```

with:

```js
formData.append('quality', imageOptions.quality);
formData.append('size', imageOptions.size);
```

- [ ] **Step 5: Reuse artifact helpers for edits**

Replace the edit response's single-image block:

```js
        const base64Image = response.data.data[0].b64_json;
        if (!base64Image) {
          return returnValue(
            'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
          );
        }

        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: `data:image/${imageOutputType};base64,${base64Image}`,
            },
          },
        ];

        const file_ids = [v4()];
        const textResponse = [
          {
            type: ContentTypes.TEXT,
            text:
              displayMessage +
              `\n\ngenerated_image_id: "${file_ids[0]}"\nreferenced_image_ids: ["${image_ids.join('", "')}"]`,
          },
        ];
        return [textResponse, { content, file_ids }];
```

with:

```js
        const { content, file_ids, generatedIds } = createImageArtifacts(
          response.data.data,
          imageOutputType,
        );
        if (!content.length) {
          return returnValue(
            'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
          );
        }

        const textResponse = [
          {
            type: ContentTypes.TEXT,
            text: createGeneratedImageText(generatedIds, image_ids),
          },
        ];
        return [textResponse, { content, file_ids }];
```

- [ ] **Step 6: Run edit tests**

Run:

```bash
cd api && npx jest test/app/clients/tools/structured/OpenAIImageTools.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add api/app/clients/tools/structured/OpenAIImageTools.js api/test/app/clients/tools/structured/OpenAIImageTools.test.js
git commit -m "feat: apply openai image defaults to edits"
```

## Task 5: Document Environment Settings

**Files:**
- Modify: `.env.example`
- Test: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`

- [ ] **Step 1: Update `.env.example`**

In the `# OpenAI Image Tools Customization` section, replace:

```env
# IMAGE_GEN_OAI_MODEL=gpt-image-1 # OpenAI image model (e.g., gpt-image-1, gpt-image-1.5)
```

with:

```env
# IMAGE_GEN_OAI_MODEL=gpt-image-1 # OpenAI image model (e.g., gpt-image-1, gpt-image-1.5, gpt-image-2 if available)
# IMAGE_GEN_OAI_QUALITY=high # Image quality default: auto, high, medium, or low
# IMAGE_GEN_OAI_SIZE=1024x1024 # Image size default: auto, 1024x1024, 1536x1024, or 1024x1536
# IMAGE_GEN_OAI_BACKGROUND=auto # Background default: auto, opaque, or transparent
# IMAGE_GEN_OAI_OUTPUT_FORMAT=png # Output format default: png, webp, or jpeg
# IMAGE_GEN_OAI_OUTPUT_COMPRESSION=100 # Compression for webp/jpeg output, 0-100
```

- [ ] **Step 2: Run the targeted tests**

Run:

```bash
cd api && npx jest test/app/clients/tools/structured/OpenAIImageTools.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 3: Commit Task 5**

Run:

```bash
git add .env.example
git commit -m "docs: document openai image quality defaults"
```

## Task 6: Final Verification

**Files:**
- Verify: `api/app/clients/tools/structured/OpenAIImageTools.js`
- Verify: `api/test/app/clients/tools/structured/OpenAIImageTools.test.js`
- Verify: `.env.example`

- [ ] **Step 1: Run the focused OpenAI image tests**

Run:

```bash
cd api && npx jest test/app/clients/tools/structured/OpenAIImageTools.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run quota wrapper regression tests**

Run:

```bash
cd api && npx jest app/clients/tools/util/handleTools.test.js --runInBand
```

Expected: PASS. This protects the existing `image_gen_oai` quota wrapping behavior.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: clean worktree.

- [ ] **Step 4: Review final diff from the task branch**

Run:

```bash
git log --oneline -5
```

Expected: recent commits include the design document and the task commits from this plan.

## Self-Review

- Spec coverage: The plan implements high-quality defaults, keeps `gpt-image-2` configurable, uses only public GPT Image parameters, applies defaults to generation and editing, handles multiple returned images, and updates docs.
- Placeholder scan: No task uses TBD, TODO, "similar to", or open-ended validation instructions.
- Type consistency: The plan uses existing CommonJS style, existing `EImageOutputType` enum values, existing tool names, and existing Jest command patterns.
