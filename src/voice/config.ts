import fs from 'fs';
import path from 'path';
import { workDir } from '../config.js';
import { VoiceGenerationConfig, LANGUAGE_OPTIONS } from './request.js';

export interface CharacterVoiceConfig {
  character_name: string;
  gpt: string;
  sovits: string;
  ref_audio: string;
  ref_text: string;
  prompt?: string;
  translate_to?: string;  // 该角色的翻译目标语言，如果为空则不翻译
  inferrence_config?: VoiceGenerationConfig;
}

export interface TranslateConfig {
  enabled: boolean;
  model_type: 'ollama' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'cohere' | 'custom';
  base_url: string;
  api_key?: string;
  model_name: string;
  context_size?: number;  // 上下文大小，默认为2
  additional_prompt?: string;  // 用户自定义的额外提示词信息
  // 兼容旧配置
  ollama_endpoint?: string;
}

export interface VoiceConfig {
  volume: number;
  gpt_sovits_url: string;
  gpt_sovits_path: string;
  model_version: string;
  translate: TranslateConfig;
  characters: CharacterVoiceConfig[];
}

export class VoiceConfigManager {
  private config: VoiceConfig | null = null;
  private configPath: string;

  constructor(workDirectory: string = workDir) {
    this.configPath = path.join(workDirectory, 'voice.config.json');
  }

  /**
   * 加载语音配置文件
   */
  loadConfig(): VoiceConfig {
    if (this.config) {
      return this.config;
    }

    if (!fs.existsSync(path.resolve(this.configPath))) {
      throw new Error(`语音配置文件不存在: ${this.configPath}\n请创建 voice.config.json 文件或参考示例配置`);
    }

    try {
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as VoiceConfig;
      
      // 验证配置文件格式
      this.validateConfig(config);
      
      this.config = config;
      console.error(`✅ 成功加载语音配置: ${this.configPath}`);
      console.error(`配置了 ${config.characters.length} 个角色`);
      
      return config;
    } catch (error) {
      throw new Error(`解析语音配置文件失败: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * 验证配置文件格式
   */
  private validateConfig(config: VoiceConfig): void {
    if (!config.volume || typeof config.volume !== 'number') {
      throw new Error('配置文件缺少有效的 volume 设置');
    }

    if (!config.gpt_sovits_url || typeof config.gpt_sovits_url !== 'string') {
      throw new Error('配置文件缺少有效的 gpt_sovits_url 设置');
    }

    if (!config.gpt_sovits_path || typeof config.gpt_sovits_path !== 'string') {
      throw new Error('配置文件缺少有效的 gpt_sovits_path 设置');
    }

    if (!fs.existsSync(config.gpt_sovits_path)) {
      throw new Error(`GPT-SoVITS项目路径不存在: ${config.gpt_sovits_path}`);
    }

    if (!config.model_version || typeof config.model_version !== 'string') {
      throw new Error('配置文件缺少有效的 model_version 设置');
    }

    if (!config.translate) {
      throw new Error('配置文件缺少 translate 配置');
    }

    this.validateTranslateConfig(config.translate);

    if (!config.characters || !Array.isArray(config.characters)) {
      throw new Error('配置文件缺少 characters 数组');
    }

    for (const [index, character] of config.characters.entries()) {
      const prefix = `角色配置 [${index}]`;
      
      if (!character.character_name) {
        throw new Error(`${prefix} 缺少 character_name`);
      }
      
      if (!character.gpt) {
        throw new Error(`${prefix} 缺少 gpt 模型路径`);
      }
      
      const gptPath = path.resolve(config.gpt_sovits_path, character.gpt);
      if (!fs.existsSync(gptPath)) {
        throw new Error(`${prefix} GPT模型文件不存在: ${gptPath}`);
      }
      
      if (!character.sovits) {
        throw new Error(`${prefix} 缺少 sovits 模型路径`);
      }
      
      const sovitsPath = path.resolve(config.gpt_sovits_path, character.sovits);
      if (!fs.existsSync(sovitsPath)) {
        throw new Error(`${prefix} SoVITS模型文件不存在: ${sovitsPath}`);
      }
      
      if (!character.ref_audio || !fs.existsSync(character.ref_audio)) {
        throw new Error(`${prefix} 参考音频文件不存在: ${character.ref_audio}`);
      }
      
      if (!character.ref_text) {
        throw new Error(`${prefix} 缺少参考文本 ref_text`);
      }

      // 验证推理配置
      if (character.inferrence_config) {
        this.validateInferenceConfig(character.inferrence_config, prefix);
      }
    }
  }

  /**
   * 验证翻译配置
   */
  private validateTranslateConfig(config: TranslateConfig): void {
    if (typeof config.enabled !== 'boolean') {
      throw new Error('配置文件的 translate.enabled 必须是布尔值');
    }

    // 如果禁用翻译，跳过其他验证
    if (!config.enabled) {
      return;
    }

    // 处理向后兼容性
    if (config.ollama_endpoint && !config.base_url) {
      config.base_url = config.ollama_endpoint;
      config.model_type = 'ollama';
      console.warn('⚠️ 检测到旧版配置格式，已自动转换为新格式。建议更新配置文件。');
    }

    if (!config.model_type) {
      throw new Error('配置文件缺少 translate.model_type 设置');
    }

    const validModelTypes = ['ollama', 'openai', 'anthropic', 'google', 'mistral', 'cohere', 'custom'];
    if (!validModelTypes.includes(config.model_type)) {
      throw new Error(`无效的 model_type: ${config.model_type}。支持的类型: ${validModelTypes.join(', ')}`);
    }

    if (!config.base_url || typeof config.base_url !== 'string') {
      throw new Error('配置文件缺少有效的 translate.base_url 设置');
    }

    if (!config.model_name || typeof config.model_name !== 'string') {
      throw new Error('配置文件缺少有效的 translate.model_name 设置');
    }

    // 验证API密钥
    if (this.requiresApiKey(config)) {
      if (!config.api_key || typeof config.api_key !== 'string') {
        throw new Error(`${config.model_type} 模型供应商需要提供 api_key`);
      }
    }
  }

  /**
   * 检查是否需要API密钥
   */
  private requiresApiKey(config: TranslateConfig): boolean {
    // Ollama 本地服务不需要API密钥
    if (config.model_type === 'ollama') {
      const url = new URL(config.base_url);
      return !(url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1');
    }
    
    // 其他供应商都需要API密钥
    return config.model_type !== 'custom';
  }

  /**
   * 验证推理配置
   */
  private validateInferenceConfig(config: VoiceGenerationConfig, prefix: string): void {
    if (config.prompt_language && !(config.prompt_language in LANGUAGE_OPTIONS)) {
      throw new Error(`${prefix} 无效的 prompt_language: ${config.prompt_language}`);
    }
    
    if (config.text_language && !(config.text_language in LANGUAGE_OPTIONS)) {
      throw new Error(`${prefix} 无效的 text_language: ${config.text_language}`);
    }
    
    if (config.top_k !== undefined && (config.top_k < 1 || config.top_k > 100)) {
      throw new Error(`${prefix} top_k 必须在 1-100 之间`);
    }
    
    if (config.top_p !== undefined && (config.top_p < 0 || config.top_p > 1)) {
      throw new Error(`${prefix} top_p 必须在 0-1 之间`);
    }
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
      throw new Error(`${prefix} temperature 必须在 0-1 之间`);
    }
    
    if (config.speed !== undefined && (config.speed < 0.6 || config.speed > 1.65)) {
      throw new Error(`${prefix} speed 必须在 0.6-1.65 之间`);
    }
  }

  /**
   * 获取角色配置
   */
  getCharacterConfig(characterName: string): CharacterVoiceConfig | null {
    const config = this.loadConfig();
    return config.characters.find(char => char.character_name === characterName) || null;
  }

  /**
   * 获取所有角色名称
   */
  getAllCharacterNames(): string[] {
    const config = this.loadConfig();
    return config.characters.map(char => char.character_name);
  }

  /**
   * 获取默认音量设置
   */
  getDefaultVolume(): number {
    const config = this.loadConfig();
    return config.volume;
  }

  /**
   * 检查角色是否已配置
   */
  hasCharacterConfig(characterName: string): boolean {
    return this.getCharacterConfig(characterName) !== null;
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 获取GPT-SoVITS服务URL
   */
  getGptSovitsUrl(): string {
    const config = this.loadConfig();
    return config.gpt_sovits_url;
  }

  /**
   * 获取GPT-SoVITS项目路径
   */
  getGptSovitsPath(): string {
    const config = this.loadConfig();
    return config.gpt_sovits_path;
  }



  /**
   * 获取模型版本
   */
  getModelVersion(): string {
    const config = this.loadConfig();
    return config.model_version;
  }

  /**
   * 获取翻译配置
   */
  getTranslateConfig(): TranslateConfig {
    const config = this.loadConfig();
    return config.translate;
  }

  /**
   * 检查是否启用翻译
   */
  isTranslateEnabled(): boolean {
    const config = this.loadConfig();
    return config.translate.enabled;
  }

  /**
   * 获取角色的翻译目标语言
   */
  getCharacterTranslateTarget(characterName: string): string | null {
    const characterConfig = this.getCharacterConfig(characterName);
    return characterConfig?.translate_to || null;
  }

  /**
   * 重新加载配置
   */
  reloadConfig(): VoiceConfig {
    this.config = null;
    return this.loadConfig();
  }
} 