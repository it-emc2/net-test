// src/services/ApiService.js
class ApiService {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(method, path, { body, params } = {}) {
    const url = new URL(path, this.baseUrl || window.location.origin);
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      });
    }

    const options = {
      method,
      headers: {},
      credentials: 'include',
    };

    if (body && method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);
    
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const error = new Error(errorBody.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    return response.json();
  }

  // Pricing
  async computePrices(payload) {
    return this.request('POST', '/api/price', { body: payload });
  }

  // Products
  async getProduct(productId) {
    return this.request('GET', `/api/products/${encodeURIComponent(productId)}`);
  }

  async searchProducts(query) {
    return this.request('GET', '/api/products', { params: { q: query } });
  }

  // Trays
  async suggestTrays({ w, l, h }) {
    return this.request('GET', '/api/trays/suggest', { params: { w, l, h } });
  }

  // Customers
  async saveCustomer(data) {
    return this.request('POST', '/api/customers', { body: data });
  }

  async searchCustomers(query) {
    return this.request('GET', '/api/customers/search', { params: { q: query } });
  }

  // Drafts
  async saveDraft(name, offerType, payload) {
    return this.request('POST', '/api/drafts', { body: { name, offerType, payload } });
  }

  async searchDrafts(offerType, query) {
    return this.request('GET', '/api/drafts/search', { params: { offerType, q: query } });
  }

  async loadDraft(id) {
    return this.request('GET', `/api/drafts/${encodeURIComponent(id)}`);
  }

  // Offers
  async saveOffer(data) {
    return this.request('POST', '/api/offers', { body: data });
  }

  async loadOffer(offerNumber) {
    return this.request('GET', `/api/offers/${encodeURIComponent(offerNumber)}`);
  }

  // Routing
  async suggestDistance(kundendaten) {
    return this.request('POST', '/api/routing/suggest-distance', { 
      body: { Kundendaten: kundendaten } 
    });
  }

  // Bitrix
  async loadBitrixContact(id) {
    return this.request('GET', `/api/bitrix/contact/${encodeURIComponent(id)}`);
  }

  // Export (returns blob)
  async downloadDocx(payload) {
    const response = await fetch('/docx-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`DOCX generation failed: ${response.status}`);
    }

    const filename = this._extractFilename(response, 'Angebot.docx');
    const blob = await response.blob();
    return { blob, filename };
  }

  async downloadPdf(payload, endpoint = '/docx-template/pdf') {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`PDF generation failed: ${response.status}`);
    }

    const filename = this._extractFilename(response, 'Angebot.pdf');
    const blob = await response.blob();
    return { blob, filename };
  }

  _extractFilename(response, fallback) {
    const cd = response.headers.get('content-disposition') || '';
    const match = cd.match(/filename="?(.*?)"?$/i);
    return match?.[1] || fallback;
  }
}

export const apiService = new ApiService();