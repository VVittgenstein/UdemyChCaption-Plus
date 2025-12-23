/**
 * Unit tests for Settings Manager
 * Task ID: T-20251223-act-009-build-popup-settings
 */

import {
  loadSettings,
  saveSettings,
  resetSettings,
  getSetting,
  setSetting,
  isConfigured,
  isEnabled,
  getModelInfo,
  estimateCost,
  DEFAULT_SETTINGS,
  PROVIDER_MODELS,
  SettingsManager,
} from '../settings-manager';
import type { UserSettings } from '../../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('Settings Manager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('provider');
      expect(DEFAULT_SETTINGS).toHaveProperty('apiKey');
      expect(DEFAULT_SETTINGS).toHaveProperty('model');
      expect(DEFAULT_SETTINGS).toHaveProperty('enabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('autoTranslate');
      expect(DEFAULT_SETTINGS).toHaveProperty('preloadEnabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('showCostEstimate');
      expect(DEFAULT_SETTINGS).toHaveProperty('showLoadingIndicator');
    });

    it('should have valid default provider', () => {
      expect(['openai', 'gemini']).toContain(DEFAULT_SETTINGS.provider);
    });

    it('should have valid default model for the default provider', () => {
      const models = PROVIDER_MODELS[DEFAULT_SETTINGS.provider];
      const modelValues = models.map((m) => m.value);
      expect(modelValues).toContain(DEFAULT_SETTINGS.model);
    });
  });

  describe('PROVIDER_MODELS', () => {
    it('should have models for OpenAI', () => {
      expect(PROVIDER_MODELS.openai).toBeDefined();
      expect(PROVIDER_MODELS.openai.length).toBeGreaterThan(0);
    });

    it('should have models for Gemini', () => {
      expect(PROVIDER_MODELS.gemini).toBeDefined();
      expect(PROVIDER_MODELS.gemini.length).toBeGreaterThan(0);
    });

    it('should have required fields for each model', () => {
      for (const provider of Object.keys(PROVIDER_MODELS)) {
        for (const model of PROVIDER_MODELS[provider]) {
          expect(model).toHaveProperty('value');
          expect(model).toHaveProperty('label');
          expect(model).toHaveProperty('costPer1kTokens');
          expect(typeof model.value).toBe('string');
          expect(typeof model.label).toBe('string');
          expect(typeof model.costPer1kTokens).toBe('number');
        }
      }
    });
  });

  describe('loadSettings', () => {
    it('should return default settings when storage is empty', async () => {
      const settings = await loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should return stored settings when available', async () => {
      const customSettings: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-1.5-pro',
      };
      localStorageMock.setItem(
        'udemy-caption-settings',
        JSON.stringify(customSettings)
      );

      const settings = await loadSettings();
      expect(settings.provider).toBe('gemini');
      expect(settings.apiKey).toBe('test-key');
      expect(settings.model).toBe('gemini-1.5-pro');
    });

    it('should merge stored settings with defaults', async () => {
      const partialSettings = { provider: 'gemini' };
      localStorageMock.setItem(
        'udemy-caption-settings',
        JSON.stringify(partialSettings)
      );

      const settings = await loadSettings();
      expect(settings.provider).toBe('gemini');
      expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    });

    it('should handle corrupted storage data', async () => {
      localStorageMock.setItem('udemy-caption-settings', 'invalid-json');

      const settings = await loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('saveSettings', () => {
    it('should save settings to storage', async () => {
      await saveSettings({ apiKey: 'new-key' });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[0][1]
      );
      expect(savedData.apiKey).toBe('new-key');
    });

    it('should merge with existing settings', async () => {
      const existing: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'gemini',
      };
      localStorageMock.setItem(
        'udemy-caption-settings',
        JSON.stringify(existing)
      );
      jest.clearAllMocks(); // Clear to track only the new save call

      await saveSettings({ apiKey: 'new-key' });

      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[0][1]
      );
      expect(savedData.provider).toBe('gemini');
      expect(savedData.apiKey).toBe('new-key');
    });
  });

  describe('resetSettings', () => {
    it('should reset settings to defaults', async () => {
      await saveSettings({ apiKey: 'test-key', provider: 'gemini' });
      await resetSettings();

      const settings = await loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('getSetting', () => {
    it('should return a specific setting value', async () => {
      await saveSettings({ provider: 'gemini' });

      const provider = await getSetting('provider');
      expect(provider).toBe('gemini');
    });
  });

  describe('setSetting', () => {
    it('should update a specific setting', async () => {
      await setSetting('enabled', false);

      const settings = await loadSettings();
      expect(settings.enabled).toBe(false);
    });
  });

  describe('isConfigured', () => {
    it('should return true when all required fields are set', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
      };
      expect(isConfigured(settings)).toBe(true);
    });

    it('should return false when apiKey is empty', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        apiKey: '',
      };
      expect(isConfigured(settings)).toBe(false);
    });

    it('should return false when model is empty', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
        model: '',
      };
      expect(isConfigured(settings)).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled and configured', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiKey: 'test-key',
      };
      expect(isEnabled(settings)).toBe(true);
    });

    it('should return false when not enabled', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        enabled: false,
        apiKey: 'test-key',
      };
      expect(isEnabled(settings)).toBe(false);
    });

    it('should return false when not configured', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        apiKey: '',
      };
      expect(isEnabled(settings)).toBe(false);
    });
  });

  describe('getModelInfo', () => {
    it('should return model info for valid provider and model', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'openai',
        model: 'gpt-4o',
      };
      const info = getModelInfo(settings);

      expect(info).not.toBeNull();
      expect(info!.label).toBe('GPT-4o');
      expect(typeof info!.costPer1kTokens).toBe('number');
    });

    it('should return null for unknown model', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'openai',
        model: 'unknown-model',
      };
      const info = getModelInfo(settings);
      expect(info).toBeNull();
    });

    it('should return null for unknown provider', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'unknown' as 'openai',
        model: 'gpt-4o',
      };
      const info = getModelInfo(settings);
      expect(info).toBeNull();
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost correctly', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'openai',
        model: 'gpt-4o',
      };

      // GPT-4o costs $0.005 per 1k tokens
      const cost = estimateCost(settings, 1000);
      expect(cost).toBeCloseTo(0.005, 4);
    });

    it('should return 0 for unknown model', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'openai',
        model: 'unknown-model',
      };
      const cost = estimateCost(settings, 1000);
      expect(cost).toBe(0);
    });

    it('should handle free models', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
      };
      const cost = estimateCost(settings, 10000);
      expect(cost).toBe(0);
    });
  });

  describe('SettingsManager class', () => {
    let manager: SettingsManager;

    beforeEach(() => {
      manager = new SettingsManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should initialize with current settings', async () => {
      await saveSettings({ apiKey: 'test-key' });

      const settings = await manager.init();
      expect(settings.apiKey).toBe('test-key');
    });

    it('should get settings from cache after init', async () => {
      await manager.init();

      const settings = await manager.getSettings();
      expect(settings).toBeDefined();
    });

    it('should update settings', async () => {
      await manager.init();

      await manager.updateSettings({ enabled: false });

      const settings = await manager.getSettings();
      expect(settings.enabled).toBe(false);
    });

    it('should check if enabled', async () => {
      await saveSettings({ enabled: true, apiKey: 'test-key' });
      await manager.init();

      expect(manager.isEnabled()).toBe(true);
    });

    it('should check if configured', async () => {
      await saveSettings({ apiKey: 'test-key' });
      await manager.init();

      expect(manager.isConfigured()).toBe(true);
    });

    it('should return false for isEnabled before init', () => {
      expect(manager.isEnabled()).toBe(false);
    });

    it('should cleanup on destroy', async () => {
      await manager.init();
      manager.destroy();

      // After destroy, isEnabled should return false
      expect(manager.isEnabled()).toBe(false);
    });
  });
});
