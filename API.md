# API Contract

Base URL: `http://localhost:8080`

All endpoints require:
```
Authorization: Bearer <clerk_session_token>
```

---

## Contacts

### List contacts
```
GET /contacts
```
**Response 200**
```json
{
  "contacts": [
    {
      "id": "uuid",
      "first_name": "Jane",
      "last_name": "Doe",
      "email": "jane@example.com",
      "phone": "555-0100",
      "source": "zillow",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Get contact
```
GET /contacts/:id
```
**Response 200**
```json
{
  "contact": {
    "id": "uuid",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "555-0100",
    "source": "zillow",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Create contact
```
POST /contacts
```
**Body**
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "email": "jane@example.com",
  "phone": "555-0100",
  "source": "zillow"
}
```
**Response 201**
```json
{
  "contact": {
    "id": "uuid",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "555-0100",
    "source": "zillow",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Update contact
```
PATCH /contacts/:id
```
**Body** (all fields optional)
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "email": "jane@example.com",
  "phone": "555-0100",
  "source": "referral"
}
```
**Response 200**
```json
{
  "contact": {
    "id": "uuid",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "555-0100",
    "source": "referral",
    "updated_at": "2024-01-02T00:00:00Z"
  }
}
```

---

### Delete contact
```
DELETE /contacts/:id
```
**Response 204** — no body

---

## Buyer Profiles

### Get buyer profile
```
GET /contacts/:id/buyer-profile
```
**Response 200**
```json
{
  "buyer_profile": {
    "id": "uuid",
    "contact_id": "uuid",
    "budget_min": 400000,
    "budget_max": 650000,
    "bedrooms": 3,
    "bathrooms": 2.0,
    "locations": ["Austin TX", "Round Rock TX"],
    "must_haves": ["garage", "backyard"],
    "deal_breakers": ["HOA", "busy street"],
    "property_type": "single_family",
    "pre_approved": true,
    "pre_approval_amount": 600000,
    "timeline": "1-3 months",
    "notes": "Motivated buyer, relocating for work.",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Create buyer profile
```
POST /contacts/:id/buyer-profile
```
**Body**
```json
{
  "budget_min": 400000,
  "budget_max": 650000,
  "bedrooms": 3,
  "bathrooms": 2.0,
  "locations": ["Austin TX", "Round Rock TX"],
  "must_haves": ["garage", "backyard"],
  "deal_breakers": ["HOA", "busy street"],
  "property_type": "single_family",
  "pre_approved": true,
  "pre_approval_amount": 600000,
  "timeline": "1-3 months",
  "notes": "Motivated buyer, relocating for work."
}
```
**Response 201**
```json
{
  "buyer_profile": {
    "id": "uuid",
    "contact_id": "uuid",
    "budget_min": 400000,
    "budget_max": 650000,
    "bedrooms": 3,
    "bathrooms": 2.0,
    "locations": ["Austin TX", "Round Rock TX"],
    "must_haves": ["garage", "backyard"],
    "deal_breakers": ["HOA", "busy street"],
    "property_type": "single_family",
    "pre_approved": true,
    "pre_approval_amount": 600000,
    "timeline": "1-3 months",
    "notes": "Motivated buyer, relocating for work.",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Update buyer profile
```
PATCH /contacts/:id/buyer-profile
```
**Body** (all fields optional)
```json
{
  "budget_max": 700000,
  "pre_approved": true,
  "pre_approval_amount": 680000,
  "timeline": "ASAP"
}
```
**Response 200**
```json
{
  "buyer_profile": {
    "id": "uuid",
    "contact_id": "uuid",
    "budget_min": 400000,
    "budget_max": 700000,
    "pre_approved": true,
    "pre_approval_amount": 680000,
    "timeline": "ASAP",
    "updated_at": "2024-01-02T00:00:00Z"
  }
}
```

---

## Deals

### List deals
```
GET /deals
```
**Query params (all optional)**
- `stage_id=uuid` — filter by stage
- `contact_id=uuid` — filter by contact

**Response 200**
```json
{
  "deals": [
    {
      "id": "uuid",
      "contact_id": "uuid",
      "contact_name": "Jane Doe",
      "stage_id": "uuid",
      "stage_name": "Touring",
      "title": "Jane Doe — 4BR Austin",
      "value": 580000,
      "notes": "Second showing scheduled.",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Get deal
```
GET /deals/:id
```
**Response 200**
```json
{
  "deal": {
    "id": "uuid",
    "contact_id": "uuid",
    "contact_name": "Jane Doe",
    "stage_id": "uuid",
    "stage_name": "Touring",
    "title": "Jane Doe — 4BR Austin",
    "value": 580000,
    "notes": "Second showing scheduled.",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Create deal
```
POST /deals
```
**Body**
```json
{
  "contact_id": "uuid",
  "stage_id": "uuid",
  "title": "Jane Doe — 4BR Austin",
  "value": 580000,
  "notes": "Second showing scheduled."
}
```
**Response 201**
```json
{
  "deal": {
    "id": "uuid",
    "contact_id": "uuid",
    "stage_id": "uuid",
    "title": "Jane Doe — 4BR Austin",
    "value": 580000,
    "notes": "Second showing scheduled.",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Update deal
```
PATCH /deals/:id
```
**Body** (all fields optional)
```json
{
  "stage_id": "uuid",
  "title": "Jane Doe — 4BR Austin",
  "value": 600000,
  "notes": "Offer accepted."
}
```
**Response 200**
```json
{
  "deal": {
    "id": "uuid",
    "stage_id": "uuid",
    "title": "Jane Doe — 4BR Austin",
    "value": 600000,
    "notes": "Offer accepted.",
    "updated_at": "2024-01-02T00:00:00Z"
  }
}
```

---

### Delete deal
```
DELETE /deals/:id
```
**Response 204** — no body

---

### List deal stages
```
GET /deal-stages
```
**Response 200**
```json
{
  "stages": [
    { "id": "uuid", "name": "Lead",           "position": 1, "color": "#94a3b8" },
    { "id": "uuid", "name": "Contacted",      "position": 2, "color": "#60a5fa" },
    { "id": "uuid", "name": "Touring",        "position": 3, "color": "#a78bfa" },
    { "id": "uuid", "name": "Offer",          "position": 4, "color": "#f59e0b" },
    { "id": "uuid", "name": "Under Contract", "position": 5, "color": "#10b981" },
    { "id": "uuid", "name": "Closed",         "position": 6, "color": "#22c55e" },
    { "id": "uuid", "name": "Lost",           "position": 7, "color": "#f87171" }
  ]
}
```

---

## Activities

### List activities for a contact
```
GET /contacts/:id/activities
```
**Response 200**
```json
{
  "activities": [
    {
      "id": "uuid",
      "contact_id": "uuid",
      "deal_id": "uuid",
      "type": "call",
      "body": "Spoke for 20 min, very interested in Westlake area.",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Create activity
```
POST /contacts/:id/activities
```
**Body**
```json
{
  "deal_id": "uuid",
  "type": "call",
  "body": "Spoke for 20 min, very interested in Westlake area."
}
```
> `type` must be one of: `call`, `email`, `note`, `showing`, `task`
> `deal_id` is optional

**Response 201**
```json
{
  "activity": {
    "id": "uuid",
    "contact_id": "uuid",
    "deal_id": "uuid",
    "type": "call",
    "body": "Spoke for 20 min, very interested in Westlake area.",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

## Chat (AI)

### List conversations for a contact
```
GET /contacts/:id/conversations
```
**Response 200**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "contact_id": "uuid",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Start a conversation
```
POST /contacts/:id/conversations
```
**Body** — none required

**Response 201**
```json
{
  "conversation": {
    "id": "uuid",
    "contact_id": "uuid",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Get messages in a conversation
```
GET /conversations/:id/messages
```
**Response 200**
```json
{
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "role": "user",
      "content": "Summarize this contact for me.",
      "created_at": "2024-01-01T00:00:00Z"
    },
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "role": "assistant",
      "content": "Jane Doe is a motivated buyer with a $400k–$650k budget...",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Send a message (AI responds)
```
POST /conversations/:id/messages
```
**Body**
```json
{
  "content": "Summarize this contact for me."
}
```
**Response 201**
```json
{
  "message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "role": "assistant",
    "content": "Jane Doe is a motivated buyer with a $400k–$650k budget...",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

## AI Profile

### Get AI profile for a contact
```
GET /contacts/:id/ai-profile
```
**Response 200**
```json
{
  "ai_profile": {
    "id": "uuid",
    "contact_id": "uuid",
    "summary": "Jane is a motivated buyer relocating from Seattle...",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

### Regenerate AI profile
```
POST /contacts/:id/ai-profile/regenerate
```
**Body** — none required

**Response 200**
```json
{
  "ai_profile": {
    "id": "uuid",
    "contact_id": "uuid",
    "summary": "Updated summary based on latest activity...",
    "updated_at": "2024-01-02T00:00:00Z"
  }
}
```

---

## Health

### Health check
```
GET /health
```
**Response 200**
```json
{ "status": "ok" }
```

---

## Error Responses

All errors return a consistent shape:

```json
{ "error": "human-readable message" }
```

| Status | Meaning |
|---|---|
| `400` | Bad request / validation error |
| `401` | Missing or invalid auth token |
| `403` | Authenticated but not authorized (wrong agent) |
| `404` | Resource not found |
| `500` | Internal server error |
