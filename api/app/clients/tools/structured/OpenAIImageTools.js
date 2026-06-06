const axios = require('axios');
const { v4 } = require('uuid');
const OpenAI = require('openai');
const FormData = require('form-data');
const { ProxyAgent } = require('undici');
const { logger } = require('@librechat/data-schemas');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { tool } = require('@librechat/agents/langchain/tools');
const { ContentTypes, EImageOutputType } = require('librechat-data-provider');
const { logAxiosError, oaiToolkit, extractBaseURL } = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFiles } = require('~/models');

const displayMessage =
  "The tool displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

/**
 * Replaces unwanted characters from the input string
 * @param {string} inputString - The input string to process
 * @returns {string} - The processed string
 */
function replaceUnwantedChars(inputString) {
  return inputString
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/"/g, '')
    .trim();
}

function returnValue(value) {
  if (typeof value === 'string') {
    return [value, {}];
  } else if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value;
    }
    return [displayMessage, value];
  }
  return value;
}

function createAbortHandler() {
  return function () {
    logger.debug('[ImageGenOAI] Image generation aborted');
  };
}

const IMAGE_QUALITIES = new Set(['auto', 'high', 'medium', 'low']);
const IMAGE_BACKGROUNDS = new Set(['transparent', 'opaque', 'auto']);
const IMAGE_GENERATION_SIZES = new Set(['auto', '1024x1024', '1536x1024', '1024x1536']);
const IMAGE_EDIT_SIZES = new Set([...IMAGE_GENERATION_SIZES, '256x256', '512x512']);
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
  const candidate = value === '' ? fallback : (value ?? fallback);
  const parsed = Number(candidate);
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
  allowedSizes = IMAGE_GENERATION_SIZES,
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
    allowed: allowedSizes,
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

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createImageLoadError(imageFile, error) {
  const filename = imageFile?.filename || imageFile?.filepath || imageFile?.file_id || 'image';
  const message = `Referenced image "${filename}" could not be loaded. It may still be uploading, may have expired, or may no longer exist in storage. Please upload the image again and retry.`;
  const imageError = new Error(message);
  imageError.cause = error;
  return imageError;
}

function createMissingImageIdMessage(imageId) {
  return `Referenced image ID "${imageId}" could not be found. Please choose an available image from this conversation or upload the image again.`;
}

/**
 * Creates OpenAI Image tools (generation and editing)
 * @param {Object} fields - Configuration fields
 * @param {ServerRequest} fields.req - Whether the tool is being used in an agent context
 * @param {boolean} fields.isAgent - Whether the tool is being used in an agent context
 * @param {string} fields.IMAGE_GEN_OAI_API_KEY - The OpenAI API key
 * @param {boolean} [fields.override] - Whether to override the API key check, necessary for app initialization
 * @param {MongoFile[]} [fields.imageFiles] - The images to be used for editing
 * @param {string} [fields.imageOutputType] - The image output type configuration
 * @param {string} [fields.fileStrategy] - The file storage strategy
 * @returns {Array<ReturnType<tool>>} - Array of image tools
 */
function createOpenAIImageTools(fields = {}) {
  /** @type {boolean} Used to initialize the Tool without necessary variables. */
  const override = fields.override ?? false;
  /** @type {boolean} */
  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }
  const { req } = fields;
  const requestImageOptions = req?.body?.imageGenerationOptions ?? {};
  const imageOutputType = fields.imageOutputType || EImageOutputType.PNG;
  const appFileStrategy = fields.fileStrategy;

  const getApiKey = () => {
    const apiKey = process.env.IMAGE_GEN_OAI_API_KEY ?? '';
    if (!apiKey && !override) {
      throw new Error('Missing IMAGE_GEN_OAI_API_KEY environment variable.');
    }
    return apiKey;
  };

  let apiKey = fields.IMAGE_GEN_OAI_API_KEY ?? getApiKey();
  const closureConfig = { apiKey };

  const imageModel = process.env.IMAGE_GEN_OAI_MODEL || 'gpt-image-1';

  let baseURL = 'https://api.openai.com/v1/';
  if (!override && process.env.IMAGE_GEN_OAI_BASEURL) {
    baseURL = extractBaseURL(process.env.IMAGE_GEN_OAI_BASEURL);
    closureConfig.baseURL = baseURL;
  }

  // Note: Azure may not yet support the latest image generation models
  if (
    !override &&
    process.env.IMAGE_GEN_OAI_AZURE_API_VERSION &&
    process.env.IMAGE_GEN_OAI_BASEURL
  ) {
    baseURL = process.env.IMAGE_GEN_OAI_BASEURL;
    closureConfig.baseURL = baseURL;
    closureConfig.defaultQuery = { 'api-version': process.env.IMAGE_GEN_OAI_AZURE_API_VERSION };
    closureConfig.defaultHeaders = {
      'api-key': process.env.IMAGE_GEN_OAI_API_KEY,
      'Content-Type': 'application/json',
    };
    closureConfig.apiKey = process.env.IMAGE_GEN_OAI_API_KEY;
  }

  const imageFiles = fields.imageFiles ?? [];

  /**
   * Image Generation Tool
   */
  const imageGenTool = tool(
    async (
      { prompt, background, n, output_compression, output_format, quality, size },
      runnableConfig,
    ) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }
      const clientConfig = { ...closureConfig };
      if (process.env.PROXY) {
        const proxyAgent = new ProxyAgent(process.env.PROXY);
        clientConfig.fetchOptions = {
          dispatcher: proxyAgent,
        };
      }

      /** @type {OpenAI} */
      const openai = new OpenAI(clientConfig);
      const imageOptions = resolveImageOptions({
        background,
        n,
        output_compression,
        output_format,
        quality: quality ?? requestImageOptions.quality,
        size: size ?? requestImageOptions.size,
        fallbackOutputFormat: imageOutputType,
      });

      let resp;
      /** @type {AbortSignal} */
      let derivedSignal = null;
      /** @type {() => void} */
      let abortHandler = null;

      try {
        if (runnableConfig?.signal) {
          derivedSignal = AbortSignal.any([runnableConfig.signal]);
          abortHandler = createAbortHandler();
          derivedSignal.addEventListener('abort', abortHandler, { once: true });
        }

        resp = await openai.images.generate(
          {
            model: imageModel,
            prompt: replaceUnwantedChars(prompt),
            ...imageOptions,
          },
          {
            signal: derivedSignal,
          },
        );
      } catch (error) {
        const message = '[image_gen_oai] Problem generating the image:';
        logAxiosError({ error, message });
        return returnValue(`Something went wrong when trying to generate the image. The OpenAI API may be unavailable:
Error Message: ${error.message}`);
      } finally {
        if (abortHandler && derivedSignal) {
          derivedSignal.removeEventListener('abort', abortHandler);
        }
      }

      if (!resp) {
        return returnValue(
          'Something went wrong when trying to generate the image. The OpenAI API may be unavailable',
        );
      }

      // For gpt-image-1, the response contains base64-encoded images
      // TODO: handle cost in `resp.usage`
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
    },
    oaiToolkit.image_gen_oai,
  );

  /**
   * Image Editing Tool
   */
  const imageEditTool = tool(async ({ prompt, image_ids, quality, size }, runnableConfig) => {
    if (!prompt) {
      throw new Error('Missing required field: prompt');
    }

    const clientConfig = { ...closureConfig };
    if (process.env.PROXY) {
      const proxyAgent = new ProxyAgent(process.env.PROXY);
      clientConfig.fetchOptions = {
        dispatcher: proxyAgent,
      };
    }

    const imageOptions = resolveImageOptions({
      quality: quality ?? requestImageOptions.quality,
      size: size ?? requestImageOptions.size,
      fallbackOutputFormat: imageOutputType,
      allowedSizes: IMAGE_EDIT_SIZES,
    });
    const formData = new FormData();
    formData.append('model', imageModel);
    formData.append('prompt', replaceUnwantedChars(prompt));
    // TODO: `mask` support
    // TODO: more than 1 image support
    // formData.append('n', n.toString());
    formData.append('quality', imageOptions.quality);
    formData.append('size', imageOptions.size);

    /** @type {Record<FileSources, undefined | NodeStreamDownloader<File>>} */
    const streamMethods = {};

    const requestFilesMap = Object.fromEntries(imageFiles.map((f) => [f.file_id, { ...f }]));

    const orderedFiles = new Array(image_ids.length);
    const idsToFetch = [];
    const indexOfMissing = Object.create(null);

    for (let i = 0; i < image_ids.length; i++) {
      const id = image_ids[i];
      const file = requestFilesMap[id];

      if (file) {
        orderedFiles[i] = file;
      } else {
        idsToFetch.push(id);
        indexOfMissing[id] = indexOfMissing[id] || [];
        indexOfMissing[id].push(i);
      }
    }

    if (idsToFetch.length) {
      const fetchedFiles = await getFiles(
        {
          user: req.user.id,
          file_id: { $in: idsToFetch },
          height: { $exists: true },
          width: { $exists: true },
        },
        {},
        {},
      );

      for (const file of fetchedFiles) {
        requestFilesMap[file.file_id] = file;
        for (const index of indexOfMissing[file.file_id] ?? []) {
          orderedFiles[index] = file;
        }
      }
    }

    const missingImageId = image_ids.find((id, index) => id && !orderedFiles[index]);
    if (missingImageId) {
      return returnValue(createMissingImageIdMessage(missingImageId));
    }

    try {
      for (const imageFile of orderedFiles) {
        if (!imageFile) {
          continue;
        }
        /** @type {NodeStream<File>} */
        let stream;
        /** @type {NodeStreamDownloader<File>} */
        let getDownloadStream;
        const source = imageFile.source || appFileStrategy;
        if (!source) {
          throw new Error('No source found for image file');
        }
        if (streamMethods[source]) {
          getDownloadStream = streamMethods[source];
        } else {
          ({ getDownloadStream } = getStrategyFunctions(source));
          streamMethods[source] = getDownloadStream;
        }
        if (!getDownloadStream) {
          throw new Error(`No download stream method found for source: ${source}`);
        }
        try {
          stream = await getDownloadStream(req, imageFile.storageKey || imageFile.filepath);
          if (!stream) {
            throw new Error('Failed to get download stream for image file');
          }
          const imageBuffer = await streamToBuffer(stream);
          formData.append('image[]', imageBuffer, {
            filename: imageFile.filename,
            contentType: imageFile.type,
          });
        } catch (error) {
          throw createImageLoadError(imageFile, error);
        }
      }
    } catch (error) {
      logger.warn('[image_edit_oai] Problem loading referenced image:', error);
      return returnValue(error.message || 'Referenced image could not be loaded.');
    }

    /** @type {import('axios').RawAxiosHeaders} */
    let headers = {
      ...formData.getHeaders(),
    };

    if (process.env.IMAGE_GEN_OAI_AZURE_API_VERSION && process.env.IMAGE_GEN_OAI_BASEURL) {
      headers['api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    /** @type {AbortSignal} */
    let derivedSignal = null;
    /** @type {() => void} */
    let abortHandler = null;

    try {
      if (runnableConfig?.signal) {
        derivedSignal = AbortSignal.any([runnableConfig.signal]);
        abortHandler = createAbortHandler();
        derivedSignal.addEventListener('abort', abortHandler, { once: true });
      }

      /** @type {import('axios').AxiosRequestConfig} */
      const axiosConfig = {
        headers,
        ...clientConfig,
        signal: derivedSignal,
        baseURL,
      };

      if (process.env.PROXY) {
        axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
      }

      if (process.env.IMAGE_GEN_OAI_AZURE_API_VERSION && process.env.IMAGE_GEN_OAI_BASEURL) {
        axiosConfig.params = {
          'api-version': process.env.IMAGE_GEN_OAI_AZURE_API_VERSION,
          ...axiosConfig.params,
        };
      }
      const response = await axios.post('/images/edits', formData, axiosConfig);

      if (!response.data || !response.data.data || !response.data.data.length) {
        return returnValue(
          'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
        );
      }

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
    } catch (error) {
      const message = '[image_edit_oai] Problem editing the image:';
      logAxiosError({ error, message });
      return returnValue(`Something went wrong when trying to edit the image. The OpenAI API may be unavailable:
Error Message: ${error.message || 'Unknown error'}`);
    } finally {
      if (abortHandler && derivedSignal) {
        derivedSignal.removeEventListener('abort', abortHandler);
      }
    }
  }, oaiToolkit.image_edit_oai);

  return [imageGenTool, imageEditTool];
}

module.exports = createOpenAIImageTools;
