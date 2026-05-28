const axios = require('axios');
const OpenAI = require('openai');
const { v4 } = require('uuid');
const { Readable } = require('stream');
const createOpenAIImageTools = require('~/app/clients/tools/structured/OpenAIImageTools');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFiles } = require('~/models');

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

describe('OpenAIImageTools', () => {
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    v4.mockReset();
    v4.mockReturnValueOnce('generated-file-1');
    v4.mockReturnValueOnce('generated-file-2');
    v4.mockReturnValue('generated-file-next');
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

    it('falls back to auto for generation when environment size is not supported', async () => {
      process.env.IMAGE_GEN_OAI_SIZE = '512x512';
      const generate = mockGenerate();
      const [imageGenTool] = createTools();

      await imageGenTool.func({ prompt: 'test prompt' });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 'auto',
        }),
        expect.any(Object),
      );
    });

    it('uses default output compression when compression environment value is blank', async () => {
      process.env.IMAGE_GEN_OAI_OUTPUT_FORMAT = 'jpeg';
      process.env.IMAGE_GEN_OAI_OUTPUT_COMPRESSION = '';
      const generate = mockGenerate();
      const [imageGenTool] = createTools();

      await imageGenTool.func({ prompt: 'test prompt' });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_format: 'jpeg',
          output_compression: 100,
        }),
        expect.any(Object),
      );
    });
  });

  it('should use "gpt-image-1.5" when IMAGE_GEN_OAI_MODEL is set to "gpt-image-1.5"', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-1.5';
    const generate = mockGenerate();
    const [imageGenTool] = createTools();

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1.5',
      }),
      expect.any(Object),
    );
  });

  it('should use custom model name from IMAGE_GEN_OAI_MODEL environment variable', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'custom-image-model';
    const generate = mockGenerate();
    const [imageGenTool] = createTools();

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-image-model',
      }),
      expect.any(Object),
    );
  });

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

    it('allows explicit edit-only sizes', async () => {
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
        size: '512x512',
      });

      const formData = axios.post.mock.calls[0][1];
      expect(formData._streams.join('\n')).toContain('512x512');
    });

    it('does not call OpenAI when a referenced local image stream is missing', async () => {
      const missingError = Object.assign(
        new Error(
          "ENOENT: no such file or directory, open '/app/client/public/images/test-user/missing.png'",
        ),
        { code: 'ENOENT' },
      );
      const missingStream = new Readable({
        read() {
          this.destroy(missingError);
        },
      });
      getStrategyFunctions.mockReturnValue({
        getDownloadStream: jest.fn().mockResolvedValue(missingStream),
      });
      const [, imageEditTool] = createTools({
        imageFiles: [
          {
            file_id: 'source-image',
            filepath: '/images/test-user/missing.png',
            filename: 'missing.png',
            type: 'image/png',
            source: 'local',
          },
        ],
      });

      const [message, artifact] = await imageEditTool.func({
        prompt: 'make it sharper',
        image_ids: ['source-image'],
      });

      expect(axios.post).not.toHaveBeenCalled();
      expect(message).toContain('could not be loaded');
      expect(message).toContain('missing.png');
      expect(message).not.toContain('OpenAI API may be unavailable');
      expect(artifact).toEqual({});
    });

    it('does not call OpenAI when a referenced image id cannot be resolved', async () => {
      const [, imageEditTool] = createTools();

      const [message, artifact] = await imageEditTool.func({
        prompt: 'make it sharper',
        image_ids: ['missing-image-id'],
      });

      expect(axios.post).not.toHaveBeenCalled();
      expect(message).toContain('Referenced image ID "missing-image-id" could not be found');
      expect(artifact).toEqual({});
    });

    it('resolves duplicate fetched image ids for every requested position', async () => {
      getFiles.mockResolvedValueOnce([
        {
          file_id: 'source-image',
          filepath: '/images/test-user/source.png',
          filename: 'source.png',
          type: 'image/png',
          source: 'local',
          height: 1024,
          width: 1024,
        },
      ]);
      const getDownloadStream = jest
        .fn()
        .mockResolvedValueOnce(Readable.from(Buffer.from('first-image')))
        .mockResolvedValueOnce(Readable.from(Buffer.from('second-image')));
      getStrategyFunctions.mockReturnValue({ getDownloadStream });
      const [, imageEditTool] = createTools();

      await imageEditTool.func({
        prompt: 'combine both references',
        image_ids: ['source-image', 'source-image'],
      });

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(getDownloadStream).toHaveBeenCalledTimes(2);
      const formData = axios.post.mock.calls[0][1];
      const imageParts = formData._streams.filter(
        (part) => Buffer.isBuffer(part) && part.toString().includes('image'),
      );
      expect(imageParts).toHaveLength(2);
    });
  });
});
