// Configuration Management Module
export const config = {
  providers: {
    openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    custom: { url: 'https://llmfoundry.straive.com/v1', model: 'gpt-4o-mini' }
  },

  load() {
    const saved = localStorage.getItem('llm-config');
    if (!saved) return {};
    return JSON.parse(saved);
  },

  save(data) {
    localStorage.setItem('llm-config', JSON.stringify({ ...data, configured: true }));
    return data;
  },

  getDefaults() {
    return { provider: 'custom', ...this.providers.custom };
  }
};