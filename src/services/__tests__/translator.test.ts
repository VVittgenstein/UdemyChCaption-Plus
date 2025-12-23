/**
 * Unit Tests for LLM Translator Module (Refactored)
 *
 * Task ID: T-20251223-act-007-build-llm-translator
 *
 * Tests for the new direct VTT translation approach:
 * - Prompt construction
 * - Duration-based VTT splitting
 * - VTT response parsing and validation
 * - Token/cost estimation
 * - Error handling
 * - Translation flow (with mocked API)
 */

import {
  buildSystemPrompt,
  buildUserPrompt,
  splitVTTByDuration,
  getVTTDurationSpan,
  parseTranslatedVTTResponse,
  validateTranslatedVTT,
  estimateTokens,
  calculateCost,
  estimateTranslationCost,
  translateVTT,
  createCourseContext,
  Translator,
} from '../translator';
import type { VTTFile, VTTTimestamp } from '../../types';

// Helper to create VTTTimestamp
function ts(hours: number, minutes: number, seconds: number, milliseconds: number = 0): VTTTimestamp {
  return { hours, minutes, seconds, milliseconds };
}

// ============================================
// Mock Setup
// ============================================

// Mock the API clients
jest.mock('../openai-client', () => ({
  chatCompletion: jest.fn(),
  estimateTokens: jest.fn((text: string) => Math.ceil(text.length / 4)),
}));

jest.mock('../gemini-client', () => ({
  generateContent: jest.fn(),
  convertFromOpenAIFormat: jest.fn((messages) => {
    const systemMsg = messages.find((m: { role: string }) => m.role === 'system');
    const contents = messages
      .filter((m: { role: string }) => m.role !== 'system')
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    return {
      systemInstruction: systemMsg?.content,
      contents,
    };
  }),
  estimateTokens: jest.fn((text: string) => Math.ceil(text.length / 4)),
}));

import { chatCompletion } from '../openai-client';
import { generateContent } from '../gemini-client';

const mockChatCompletion = chatCompletion as jest.MockedFunction<typeof chatCompletion>;
const mockGenerateContent = generateContent as jest.MockedFunction<typeof generateContent>;

// ============================================
// Test Data
// ============================================

const sampleVTT = `WEBVTT

1
00:00:00.000 --> 00:00:03.000
Hello, welcome to this course.

2
00:00:03.500 --> 00:00:07.000
Today we will learn about React.

3
00:00:07.500 --> 00:00:12.000
Let's get started with the basics.`;

const sampleTranslatedVTT = `WEBVTT

1
00:00:00.000 --> 00:00:03.000
你好，欢迎来到这门课程。

2
00:00:03.500 --> 00:00:07.000
今天我们将学习 React。

3
00:00:07.500 --> 00:00:12.000
让我们从基础开始。`;

// VTT spanning 15 minutes for batch split testing
const longVTT = `WEBVTT

1
00:00:00.000 --> 00:05:00.000
This is the first section.

2
00:05:00.000 --> 00:10:00.000
This is the second section.

3
00:10:00.000 --> 00:15:00.000
This is the third section.`;

const longVTTTranslatedPart1 = `WEBVTT

1
00:00:00.000 --> 00:05:00.000
这是第一部分。

2
00:05:00.000 --> 00:10:00.000
这是第二部分。`;

const longVTTTranslatedPart2 = `WEBVTT

3
00:10:00.000 --> 00:15:00.000
这是第三部分。`;

// ============================================
// Tests: Prompt Building
// ============================================

describe('buildSystemPrompt', () => {
  it('should build a basic system prompt for English to Chinese', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('English');
    expect(prompt).toContain('Chinese');
    expect(prompt).toContain('简体中文');
    expect(prompt).toContain('translator');
    expect(prompt).toContain('WebVTT');
    expect(prompt).toContain('WEBVTT');
    expect(prompt).toContain('timestamp');
  });

  it('should include course context when provided', () => {
    const context = {
      courseName: 'React Mastery',
      sectionName: 'Introduction',
      lectureName: 'Getting Started',
    };

    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('React Mastery');
    expect(prompt).toContain('Introduction');
    expect(prompt).toContain('Getting Started');
    expect(prompt).toContain('CONTEXT');
  });

  it('should include subject hint when provided', () => {
    const context = {
      subject: 'Web Development',
    };

    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain('Web Development');
  });

  it('should not include context section when no context provided', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).not.toContain('CONTEXT');
  });

  it('should mention preserving timestamps exactly', () => {
    const prompt = buildSystemPrompt();

    expect(prompt.toLowerCase()).toContain('timestamp');
    expect(prompt).toContain('EXACTLY');
  });
});

describe('buildUserPrompt', () => {
  it('should include the VTT content', () => {
    const prompt = buildUserPrompt(sampleVTT);

    expect(prompt).toContain('WEBVTT');
    expect(prompt).toContain('Hello, welcome to this course.');
    expect(prompt).toContain('00:00:00.000 --> 00:00:03.000');
  });

  it('should request translation to Chinese', () => {
    const prompt = buildUserPrompt(sampleVTT);

    expect(prompt).toContain('Chinese');
    expect(prompt).toContain('Translate');
  });

  it('should request only VTT output', () => {
    const prompt = buildUserPrompt(sampleVTT);

    expect(prompt.toLowerCase()).toContain('only');
    expect(prompt.toLowerCase()).toContain('webvtt');
  });
});

// ============================================
// Tests: Duration-Based Splitting
// ============================================

describe('splitVTTByDuration', () => {
  it('should not split short VTT files', () => {
    const vttFile: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 0, 3), text: 'Hello' },
        { id: '2', startTime: ts(0, 0, 3, 500), endTime: ts(0, 0, 7), text: 'World' },
      ],
    };

    const batches = splitVTTByDuration(vttFile, 10 * 60 * 1000); // 10 minutes

    expect(batches).toHaveLength(1);
    expect(batches[0].cues).toHaveLength(2);
  });

  it('should split VTT by duration', () => {
    const vttFile: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 5, 0), text: 'Part 1' },
        { id: '2', startTime: ts(0, 5, 0), endTime: ts(0, 10, 0), text: 'Part 2' },
        { id: '3', startTime: ts(0, 10, 0), endTime: ts(0, 15, 0), text: 'Part 3' },
      ],
    };

    const batches = splitVTTByDuration(vttFile, 10 * 60 * 1000); // 10 minutes

    expect(batches).toHaveLength(2);
    expect(batches[0].cues).toHaveLength(2); // 0-10 minutes
    expect(batches[1].cues).toHaveLength(1); // 10-15 minutes
  });

  it('should handle empty VTT file', () => {
    const vttFile: VTTFile = {
      header: 'WEBVTT',
      cues: [],
    };

    const batches = splitVTTByDuration(vttFile, 10 * 60 * 1000);

    expect(batches).toHaveLength(1);
    expect(batches[0].cues).toHaveLength(0);
  });

  it('should preserve header in all batches', () => {
    const vttFile: VTTFile = {
      header: 'WEBVTT - Custom Header',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 5, 0), text: 'Part 1' },
        { id: '2', startTime: ts(0, 10, 0), endTime: ts(0, 15, 0), text: 'Part 2' },
      ],
    };

    const batches = splitVTTByDuration(vttFile, 5 * 60 * 1000); // 5 minutes

    expect(batches).toHaveLength(2);
    expect(batches[0].header).toBe('WEBVTT - Custom Header');
    expect(batches[1].header).toBe('WEBVTT - Custom Header');
  });

  it('should split correctly with small batch duration', () => {
    const vttFile: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 1, 0), text: 'A' },
        { id: '2', startTime: ts(0, 1, 0), endTime: ts(0, 2, 0), text: 'B' },
        { id: '3', startTime: ts(0, 2, 0), endTime: ts(0, 3, 0), text: 'C' },
        { id: '4', startTime: ts(0, 3, 0), endTime: ts(0, 4, 0), text: 'D' },
      ],
    };

    const batches = splitVTTByDuration(vttFile, 2 * 60 * 1000); // 2 minutes

    expect(batches).toHaveLength(2);
    expect(batches[0].cues).toHaveLength(2); // 0-2 minutes
    expect(batches[1].cues).toHaveLength(2); // 2-4 minutes
  });
});

describe('getVTTDurationSpan', () => {
  it('should calculate duration span', () => {
    const vttFile: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 5), endTime: ts(0, 0, 10), text: 'A' },
        { id: '2', startTime: ts(0, 0, 10), endTime: ts(0, 0, 20), text: 'B' },
      ],
    };

    const span = getVTTDurationSpan(vttFile);

    expect(span.startMs).toBe(5000);
    expect(span.endMs).toBe(20000);
    expect(span.durationMs).toBe(15000);
  });

  it('should handle empty cues', () => {
    const vttFile: VTTFile = {
      header: 'WEBVTT',
      cues: [],
    };

    const span = getVTTDurationSpan(vttFile);

    expect(span.startMs).toBe(0);
    expect(span.endMs).toBe(0);
    expect(span.durationMs).toBe(0);
  });
});

// ============================================
// Tests: VTT Response Parsing
// ============================================

describe('parseTranslatedVTTResponse', () => {
  it('should parse valid VTT response', () => {
    const result = parseTranslatedVTTResponse(sampleTranslatedVTT);

    expect(result.success).toBe(true);
    expect(result.vttFile).toBeDefined();
    expect(result.vttFile!.cues).toHaveLength(3);
    expect(result.vttFile!.cues[0].text).toBe('你好，欢迎来到这门课程。');
  });

  it('should handle VTT wrapped in markdown code blocks', () => {
    const wrapped = '```vtt\n' + sampleTranslatedVTT + '\n```';
    const result = parseTranslatedVTTResponse(wrapped);

    expect(result.success).toBe(true);
    expect(result.vttFile).toBeDefined();
    expect(result.vttFile!.cues).toHaveLength(3);
  });

  it('should handle VTT wrapped in webvtt code blocks', () => {
    const wrapped = '```webvtt\n' + sampleTranslatedVTT + '\n```';
    const result = parseTranslatedVTTResponse(wrapped);

    expect(result.success).toBe(true);
    expect(result.vttFile).toBeDefined();
  });

  it('should extract WEBVTT from response with extra text', () => {
    const withExtra = 'Here is the translation:\n\n' + sampleTranslatedVTT;
    const result = parseTranslatedVTTResponse(withExtra);

    expect(result.success).toBe(true);
    expect(result.vttFile).toBeDefined();
  });

  it('should fail on invalid VTT response', () => {
    const result = parseTranslatedVTTResponse('This is not a VTT file');

    expect(result.success).toBe(false);
    expect(result.error).toContain('WEBVTT');
  });

  it('should fail on empty response', () => {
    const result = parseTranslatedVTTResponse('');

    expect(result.success).toBe(false);
  });
});

// ============================================
// Tests: VTT Validation
// ============================================

describe('validateTranslatedVTT', () => {
  it('should validate matching VTT files', () => {
    const original: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 0, 3), text: 'Hello' },
        { id: '2', startTime: ts(0, 0, 3, 500), endTime: ts(0, 0, 7), text: 'World' },
      ],
    };

    const translated: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 0, 3), text: '你好' },
        { id: '2', startTime: ts(0, 0, 3, 500), endTime: ts(0, 0, 7), text: '世界' },
      ],
    };

    const result = validateTranslatedVTT(original, translated);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect cue count mismatch', () => {
    const original: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 0, 3), text: 'Hello' },
        { id: '2', startTime: ts(0, 0, 3, 500), endTime: ts(0, 0, 7), text: 'World' },
      ],
    };

    const translated: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 0, 3), text: '你好' },
      ],
    };

    const result = validateTranslatedVTT(original, translated);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('count mismatch'))).toBe(true);
  });

  it('should detect timestamp mismatch', () => {
    const original: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 0), endTime: ts(0, 0, 3), text: 'Hello' },
      ],
    };

    const translated: VTTFile = {
      header: 'WEBVTT',
      cues: [
        { id: '1', startTime: ts(0, 0, 1), endTime: ts(0, 0, 4), text: '你好' },
      ],
    };

    const result = validateTranslatedVTT(original, translated);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Timestamp mismatch'))).toBe(true);
  });
});

// ============================================
// Tests: Token/Cost Estimation
// ============================================

describe('estimateTokens', () => {
  it('should estimate tokens for OpenAI', () => {
    const tokens = estimateTokens('openai', 'Hello, world!');
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate tokens for Gemini', () => {
    const tokens = estimateTokens('gemini', 'Hello, world!');
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('calculateCost', () => {
  it('should calculate cost for GPT-5.1', () => {
    const cost = calculateCost('gpt-5.1', 1000);
    expect(cost).toBe(0.008); // $0.008 per 1K tokens
  });

  it('should calculate cost for GPT-5.2', () => {
    const cost = calculateCost('gpt-5.2', 1000);
    expect(cost).toBe(0.01);
  });

  it('should calculate cost for GPT-5-Pro', () => {
    const cost = calculateCost('gpt-5-pro', 1000);
    expect(cost).toBe(0.015);
  });

  it('should calculate cost for GPT-5', () => {
    const cost = calculateCost('gpt-5', 1000);
    expect(cost).toBe(0.006);
  });

  it('should calculate cost for Gemini 3 Pro Preview', () => {
    const cost = calculateCost('gemini-3-pro-preview', 1000);
    expect(cost).toBe(0.005);
  });

  it('should calculate cost for Gemini 3 Flash Preview', () => {
    const cost = calculateCost('gemini-3-flash-preview', 1000);
    expect(cost).toBe(0.001);
  });

  it('should calculate cost for Gemini 2.5 Pro', () => {
    const cost = calculateCost('gemini-2.5-pro', 1000);
    expect(cost).toBe(0.003);
  });

  it('should calculate cost for Gemini 2.5 Flash', () => {
    const cost = calculateCost('gemini-2.5-flash', 1000);
    expect(cost).toBe(0.0005);
  });

  it('should use default cost for unknown models', () => {
    const cost = calculateCost('unknown-model', 1000);
    expect(cost).toBeGreaterThan(0);
  });
});

describe('estimateTranslationCost', () => {
  it('should estimate cost for valid VTT', () => {
    const result = estimateTranslationCost(sampleVTT, 'openai', 'gpt-5.1');

    expect(result.cueCount).toBe(3);
    expect(result.estimatedPromptTokens).toBeGreaterThan(0);
    expect(result.estimatedOutputTokens).toBeGreaterThan(0);
    expect(result.estimatedTotalTokens).toBeGreaterThan(0);
    expect(result.estimatedCost).toBeGreaterThan(0);
    expect(result.estimatedBatches).toBe(1);
  });

  it('should return zeros for invalid VTT', () => {
    const result = estimateTranslationCost('invalid content', 'openai', 'gpt-5.1');

    expect(result.cueCount).toBe(0);
    expect(result.estimatedTotalTokens).toBe(0);
    expect(result.estimatedCost).toBe(0);
    expect(result.estimatedBatches).toBe(0);
  });

  it('should estimate multiple batches for long content', () => {
    const result = estimateTranslationCost(longVTT, 'openai', 'gpt-5.1');

    expect(result.cueCount).toBe(3);
    expect(result.estimatedBatches).toBe(2); // 15 minutes = 2 batches at 10 min each
  });
});

// ============================================
// Tests: Translation Flow
// ============================================

describe('translateVTT', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should translate VTT using OpenAI', async () => {
    mockChatCompletion.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: 'gpt-5.1',
    });

    const result = await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    expect(result.success).toBe(true);
    expect(result.translatedVTT).toContain('WEBVTT');
    expect(result.translatedVTT).toContain('你好，欢迎来到这门课程。');
    expect(result.cueCount).toBe(3);
    expect(result.tokensUsed).toBe(150);
    expect(result.batchCount).toBe(1);
    expect(mockChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('should translate VTT using Gemini', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      model: 'gemini-2.5-flash',
    });

    const result = await translateVTT(sampleVTT, {
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
    });

    expect(result.success).toBe(true);
    expect(result.translatedVTT).toContain('WEBVTT');
    expect(result.cueCount).toBe(3);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should include course context in translation', async () => {
    mockChatCompletion.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      totalTokens: 150,
    });

    await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
      courseContext: {
        courseName: 'React Course',
        sectionName: 'Basics',
      },
    });

    const callArgs = mockChatCompletion.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage?.content).toContain('React Course');
    expect(systemMessage?.content).toContain('Basics');
  });

  it('should handle API errors', async () => {
    mockChatCompletion.mockResolvedValueOnce({
      success: false,
      error: 'Invalid API key',
      errorCode: 'INVALID_API_KEY',
    });

    const result = await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'invalid-key',
      model: 'gpt-5.1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid API key');
    expect(result.errorCode).toBe('INVALID_API_KEY');
  });

  it('should handle parse errors', async () => {
    const result = await translateVTT('invalid vtt content', {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PARSE_ERROR');
  });

  it('should handle empty VTT', async () => {
    const emptyVTT = 'WEBVTT\n\n';

    const result = await translateVTT(emptyVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('EMPTY_CONTENT');
  });

  it('should retry on transient errors', async () => {
    mockChatCompletion
      .mockResolvedValueOnce({
        success: false,
        error: 'Network error',
        errorCode: 'NETWORK_ERROR',
      })
      .mockResolvedValueOnce({
        success: true,
        content: sampleTranslatedVTT,
        totalTokens: 150,
      });

    const result = await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
      maxRetries: 2,
    });

    expect(result.success).toBe(true);
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('should not retry on auth errors', async () => {
    mockChatCompletion.mockResolvedValue({
      success: false,
      error: 'Invalid API key',
      errorCode: 'INVALID_API_KEY',
    });

    const result = await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'invalid-key',
      model: 'gpt-5.1',
      maxRetries: 2,
    });

    expect(result.success).toBe(false);
    expect(mockChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('should respect timeout', async () => {
    mockChatCompletion.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      totalTokens: 150,
    });

    await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
      timeout: 30000,
    });

    const callArgs = mockChatCompletion.mock.calls[0][0];
    expect(callArgs.timeout).toBe(30000);
  });

  it('should handle batched translation for long content', async () => {
    // Mock two API calls for two batches
    mockChatCompletion
      .mockResolvedValueOnce({
        success: true,
        content: longVTTTranslatedPart1,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      })
      .mockResolvedValueOnce({
        success: true,
        content: longVTTTranslatedPart2,
        promptTokens: 80,
        completionTokens: 40,
        totalTokens: 120,
      });

    const result = await translateVTT(longVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
      maxBatchDurationMs: 10 * 60 * 1000, // 10 minutes
    });

    expect(result.success).toBe(true);
    expect(result.batchCount).toBe(2);
    expect(result.cueCount).toBe(3);
    expect(result.tokensUsed).toBe(270); // 150 + 120
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('should report progress for batched translation', async () => {
    mockChatCompletion
      .mockResolvedValueOnce({
        success: true,
        content: longVTTTranslatedPart1,
        totalTokens: 150,
      })
      .mockResolvedValueOnce({
        success: true,
        content: longVTTTranslatedPart2,
        totalTokens: 120,
      });

    const updates: number[] = [];
    const result = await translateVTT(longVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
      maxBatchDurationMs: 10 * 60 * 1000,
      onProgress: (p) => updates.push(p),
    });

    expect(result.success).toBe(true);
    expect(updates[0]).toBe(0);
    expect(updates).toContain(50);
    expect(updates[updates.length - 1]).toBe(100);
  });

  it('should retry on invalid VTT response', async () => {
    mockChatCompletion
      .mockResolvedValueOnce({
        success: true,
        content: 'This is not valid VTT', // Invalid response
        totalTokens: 150,
      })
      .mockResolvedValueOnce({
        success: true,
        content: sampleTranslatedVTT, // Valid response on retry
        totalTokens: 150,
      });

    const result = await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
      maxRetries: 2,
    });

    expect(result.success).toBe(true);
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('should retry on timestamp mismatch', async () => {
    const wrongTimestampVTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
你好，欢迎来到这门课程。

2
00:00:04.500 --> 00:00:08.000
今天我们将学习 React。

3
00:00:08.500 --> 00:00:13.000
让我们从基础开始。`;

    mockChatCompletion
      .mockResolvedValueOnce({
        success: true,
        content: wrongTimestampVTT, // Wrong timestamps
        totalTokens: 150,
      })
      .mockResolvedValueOnce({
        success: true,
        content: sampleTranslatedVTT, // Correct timestamps on retry
        totalTokens: 150,
      });

    const result = await translateVTT(sampleVTT, {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
      maxRetries: 2,
    });

    expect(result.success).toBe(true);
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });
});

// ============================================
// Tests: Utility Functions
// ============================================

describe('createCourseContext', () => {
  it('should create context from CourseInfo', () => {
    const courseInfo = {
      courseId: '12345',
      courseSlug: 'react-course',
      lectureId: '67890',
      courseTitle: 'React Mastery',
      sectionTitle: 'Introduction',
      lectureTitle: 'Getting Started',
    };

    const context = createCourseContext(courseInfo);

    expect(context.courseName).toBe('React Mastery');
    expect(context.sectionName).toBe('Introduction');
    expect(context.lectureName).toBe('Getting Started');
  });

  it('should handle missing optional fields', () => {
    const courseInfo = {
      courseId: '12345',
      courseSlug: 'react-course',
      lectureId: '67890',
    };

    const context = createCourseContext(courseInfo);

    expect(context.courseName).toBeUndefined();
    expect(context.sectionName).toBeUndefined();
    expect(context.lectureName).toBeUndefined();
  });
});

// ============================================
// Tests: Translator Class
// ============================================

describe('Translator class', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should translate with configured options', async () => {
    mockChatCompletion.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      totalTokens: 150,
    });

    const translator = new Translator({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    const result = await translator.translate(sampleVTT);

    expect(result.success).toBe(true);
  });

  it('should allow override options', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      totalTokens: 150,
    });

    const translator = new Translator({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    const result = await translator.translate(sampleVTT, {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    expect(result.success).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockChatCompletion).not.toHaveBeenCalled();
  });

  it('should require provider', async () => {
    const translator = new Translator({
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    const result = await translator.translate(sampleVTT);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_PROVIDER');
  });

  it('should require API key', async () => {
    const translator = new Translator({
      provider: 'openai',
      model: 'gpt-5.1',
    });

    const result = await translator.translate(sampleVTT);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_API_KEY');
  });

  it('should require model', async () => {
    const translator = new Translator({
      provider: 'openai',
      apiKey: 'test-key',
    });

    const result = await translator.translate(sampleVTT);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_MODEL');
  });

  it('should estimate cost', () => {
    const translator = new Translator({
      provider: 'openai',
      model: 'gpt-5.1',
    });

    const estimate = translator.estimateCost(sampleVTT);

    expect(estimate.cueCount).toBe(3);
    expect(estimate.estimatedCost).toBeGreaterThan(0);
  });

  it('should set course context', async () => {
    mockChatCompletion.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      totalTokens: 150,
    });

    const translator = new Translator({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    translator.setCourseContext({
      courseName: 'Test Course',
    });

    await translator.translate(sampleVTT);

    const callArgs = mockChatCompletion.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage?.content).toContain('Test Course');
  });

  it('should configure options', async () => {
    mockChatCompletion.mockResolvedValueOnce({
      success: true,
      content: sampleTranslatedVTT,
      totalTokens: 150,
    });

    const translator = new Translator();

    translator.configure({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-5.1',
    });

    const result = await translator.translate(sampleVTT);

    expect(result.success).toBe(true);
  });
});
