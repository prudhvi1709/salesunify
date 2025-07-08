// LLM Client Module
export class LLMClient {
  constructor(config) {
    this.config = config;
  }

  async call(prompt) {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.statusText}`);
    
    const result = await response.json();
    return result.choices[0].message.content;
  }

  async translateHeaders(headers) {
    const prompt = `Translate these Korean Excel headers to English standard sales data fields.
Return ONLY a JSON object mapping Korean headers to English equivalents.

Korean headers: ${JSON.stringify(headers)}

Standard English fields: date, product_name, product_code, quantity, unit_price, total_amount, customer_name, customer_id, sales_rep, region

Example: {"날짜": "date", "제품명": "product_name", "수량": "quantity"}`;
    
    const response = await this.call(prompt);
    const cleaned = response.trim().replace(/```json\s*|```\s*$/g, '');
    return JSON.parse(cleaned);
  }

  async fixRecord(record) {
    const prompt = `Fix this sales record data. Fill missing values with reasonable defaults and correct any data type issues.
Return ONLY the corrected JSON record.

Original record: ${JSON.stringify(record)}
Errors: ${record._validation_errors?.join(', ') || 'Unknown errors'}

Rules:
- quantity, unit_price, total_amount must be numbers
- total_amount should equal quantity * unit_price
- date should be in DD-MM-YYYY format (convert from any format)
- Fill missing required fields with reasonable defaults`;
    
    const response = await this.call(prompt);
    const cleaned = response.trim().replace(/```json\s*|```\s*$/g, '');
    return JSON.parse(cleaned);
  }
}