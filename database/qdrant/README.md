# Qdrant — Apollo Restaurant OS (Vector Database)

## Architectural Role

Qdrant is the vector similarity search engine powering the semantic intelligence, agent retrieval-augmented generation (RAG), and unstructured search capabilities in Apollo Restaurant OS.

## Vector Collections

1. **`menu_embeddings`**:
   - Vector dimensions: 1536 (OpenAI text-embedding-3-small) / 768 (Gemini text-embedding-004) / configurable local Ollama embeddings.
   - Payload: Item ID, category, allergens, dietary flags (vegan, gluten-free, halal), spice level, price tier.
   - Purpose: Natural language menu search ("something light, savory, and dairy-free for lunch").
2. **`agent_knowledge_base`**:
   - Standard Operating Procedures (SOPs), food safety regulations (HACCP), wine pairings, service scripts, staff onboarding manuals.
   - Purpose: Grounding conversational and decision-making agents with verified organizational context.
3. **`recipe_knowledge`**:
   - Prep instructions, plating specs, substitution rules, yield factors.
   - Purpose: Assisting kitchen line cooks and automated cooking assistants with contextual prep guidance.
4. **`customer_taste_profiles`**:
   - Dense representations of flavor preferences, dietary restrictions, and historical review sentiment.

## Local Development

- Container image: `qdrant/qdrant:v1.13.2`
- HTTP REST API: `http://localhost:6333`
- gRPC API: `localhost:6334`
- Web Dashboard: `http://localhost:6333/dashboard`
- Persistent storage: `docker-data/qdrant`
