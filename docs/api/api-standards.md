# API Standards & Interface Guidelines

## 1. Design Philosophy

All Apollo Restaurant OS core services adhere to **API-First Design Principles**. Every business capability is exposed through well-documented, versioned REST endpoints and real-time WebSocket channels.

## 2. URL Conventions

- All primary API routes are versioned: `/api/v1/<domain-resource>`.
- Resource collections use plural nouns: `/api/v1/orders`, `/api/v1/menu-items`.
- Sub-resources model containment: `/api/v1/orders/{orderId}/items`.

## 3. Standard Response Envelopes

### Success Envelope

```json
{
  "success": true,
  "data": {
    "id": "ord_1029384756",
    "status": "placed",
    "total": 42.5
  },
  "meta": {
    "timestamp": "2026-11-12T19:30:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid menu item modifier selection",
    "details": [
      {
        "path": "items.0.modifiers.temp",
        "message": "Meat temperature is required"
      }
    ]
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## 4. HTTP Status Code Conventions

- `200 OK`: Successful retrieval or synchronous update.
- `201 Created`: Resource created successfully.
- `204 No Content`: Successful request with no body returned.
- `400 Bad Request`: Payload validation failed (Zod error).
- `401 Unauthorized`: Missing or invalid authentication token.
- `403 Forbidden`: Authenticated identity lacks permission for tenant or resource.
- `404 Not Found`: Resource or route does not exist.
- `409 Conflict`: Concurrency conflict or duplicate unique key.
- `422 Unprocessable Entity`: Syntactically valid request violates business invariants.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Unhandled server exception.

## 5. Idempotency Keys

Mutating endpoints (`POST /orders`, `POST /payments`) accept an `Idempotency-Key` header to prevent duplicate charge or duplicate order submission during network retries.
