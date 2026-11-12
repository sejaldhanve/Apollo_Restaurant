# Qdrant Collection Initialization Specifications

Collections are managed programmatically via the Python AI agent service (`services/agents/`) during bootstrapping.

```json
{
  "collections": [
    {
      "name": "menu_embeddings",
      "vectors": {
        "size": 1536,
        "distance": "Cosine"
      },
      "optimizers_config": {
        "default_segment_number": 2
      }
    },
    {
      "name": "agent_knowledge_base",
      "vectors": {
        "size": 1536,
        "distance": "Cosine"
      }
    },
    {
      "name": "customer_taste_profiles",
      "vectors": {
        "size": 1536,
        "distance": "Cosine"
      }
    }
  ]
}
```
