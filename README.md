# net-test

Full project documentation is in `DOCS.md`.

See `DOCS.md` for setup, structure, scripts, and development notes.

## External Search API

The existing internal offer and draft APIs remain unchanged.

For external consumers, the app now exposes additive endpoints on top of the current implementation:

- `GET /api/offers/external/search?q=mustermann&limit=20`
- `GET /api/offers/external/drafts/:id`
- `GET /api/offers/external/offers/:offerNumber`
- `POST /api/arbeitsbericht/external/pdf`

### Search endpoint

Searches across both drafts and offers and returns a normalized external result shape.

Example:

```http
GET /api/offers/external/search?q=mustermann&limit=20
```

Example response:

```json
{
  "results": [
    {
      "kind": "draft",
      "id": "661234abcd",
      "title": "Max Mustermann",
      "offerType": "bu",
      "offerNumber": "",
      "angNumber": "",
      "customerNumber": "",
      "dealId": "",
      "firstName": "Max",
      "lastName": "Mustermann",
      "email": "max@example.com",
      "city": "Berlin",
      "postalCode": "10115",
      "phone": "01701234567",
      "createdAt": "2026-04-10T08:00:00.000Z",
      "updatedAt": "2026-04-10T09:00:00.000Z"
    },
    {
      "kind": "offer",
      "id": "661999abcd",
      "title": "Max Mustermann",
      "offerType": "bwt",
      "offerNumber": "ANG2025-1008-092040",
      "angNumber": "ANG2025-1008-092040",
      "customerNumber": "",
      "dealId": "12345",
      "firstName": "Max",
      "lastName": "Mustermann",
      "email": "max@example.com",
      "city": "Berlin",
      "postalCode": "10115",
      "phone": "01701234567",
      "createdAt": "2026-04-09T08:00:00.000Z",
      "updatedAt": "2026-04-10T07:30:00.000Z"
    }
  ],
  "query": "mustermann",
  "limit": 20
}
```

### Detail endpoints

Use the detail endpoints after search when the external app needs the full payload:

- `GET /api/offers/external/drafts/:id`
- `GET /api/offers/external/offers/:offerNumber`

Both endpoints return normalized metadata plus the stored `payload`. The offer detail endpoint also includes `pricing` and `status`.

### External Arbeitsbericht PDF endpoint

For consumers that want a PDF directly from a selected search result, the app also exposes:

- `POST /api/arbeitsbericht/external/pdf`

Request body for a draft:

```json
{
  "kind": "draft",
  "id": "661234abcd"
}
```

Request body for an offer:

```json
{
  "kind": "offer",
  "offerNumber": "ANG2025-1008-092040"
}
```

Behavior:

- resolves the selected draft or offer from the database
- extracts its stored `payload`
- generates the Arbeitsbericht PDF from that payload
- responds with `Content-Type: application/pdf`

This endpoint is additive and does not change the existing `POST /api/arbeitsbericht/pdf` route, which still expects the raw payload JSON directly.
 
