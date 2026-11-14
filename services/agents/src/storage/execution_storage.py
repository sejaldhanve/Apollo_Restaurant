"""Execution storage abstraction and in-memory implementation."""

from abc import ABC, abstractmethod
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from src.models.execution import ExecutionStatus, TaskExecution


class BaseExecutionStorage(ABC):
    """Abstract storage interface for orchestrator task executions.

    Provides a clean persistence boundary allowing the orchestrator to record
    lifecycle updates independently of the underlying storage engine (e.g. In-Memory,
    Redis, or PostgreSQL).
    """

    @abstractmethod
    def save(self, execution: TaskExecution) -> None:
        """Persist or insert a new task execution."""
        raise NotImplementedError

    @abstractmethod
    def get(self, execution_id: str) -> TaskExecution | None:
        """Retrieve an execution record by its identifier."""
        raise NotImplementedError

    @abstractmethod
    def list_by_tenant(
        self, organization_id: str, location_id: str | None = None
    ) -> list[TaskExecution]:
        """List all executions matching the specified tenant filters."""
        raise NotImplementedError

    @abstractmethod
    def update(self, execution_id: str, updates: dict[str, Any]) -> TaskExecution | None:
        """Apply partial updates to an existing execution record."""
        raise NotImplementedError


class InMemoryExecutionStorage(BaseExecutionStorage):
    """Thread-safe in-memory execution storage.

    IMPORTANT RESTART LIMITATIONS:
    ------------------------------
    This storage implementation retains execution state solely in volatile process
    memory. When the Python service terminates or restarts (e.g., deployments, crashes,
    or scaling events), all past execution history is discarded.

    EXTENSIBILITY & PERSISTENCE MIGRATION:
    -------------------------------------
    This abstraction is designed to be fully replaceable without changing orchestrator
    core logic. For persistent production deployments:
    1. Implement a `PostgreSQLExecutionStorage` or `RedisExecutionStorage` inheriting
       from `BaseExecutionStorage`.
    2. Swap the storage instance in `src/storage/__init__.py`.
    """

    def __init__(self, capacity: int = 1000) -> None:
        self._capacity = capacity
        self._executions: dict[str, TaskExecution] = {}
        self._lock = Lock()

    def save(self, execution: TaskExecution) -> None:
        with self._lock:
            # Enforce circular capacity retention
            if (
                len(self._executions) >= self._capacity
                and execution.execution_id not in self._executions
            ):
                oldest_id = next(iter(self._executions))
                del self._executions[oldest_id]
            self._executions[execution.execution_id] = execution

    def get(self, execution_id: str) -> TaskExecution | None:
        with self._lock:
            return self._executions.get(execution_id)

    def list_by_tenant(
        self, organization_id: str, location_id: str | None = None
    ) -> list[TaskExecution]:
        with self._lock:
            results: list[TaskExecution] = []
            for item in self._executions.values():
                if item.organization_id == organization_id and (
                    location_id is None or item.location_id == location_id
                ):
                    results.append(item)
            return sorted(results, key=lambda x: x.created_at, reverse=True)

    def update(self, execution_id: str, updates: dict[str, Any]) -> TaskExecution | None:
        with self._lock:
            execution = self._executions.get(execution_id)
            if not execution:
                return None

            data = execution.model_dump()
            data.update(updates)

            # Auto-timestamp completion
            if updates.get("status") in (
                ExecutionStatus.COMPLETED,
                ExecutionStatus.FAILED,
                ExecutionStatus.CANCELLED,
            ) and not data.get("completed_at"):
                data["completed_at"] = datetime.now(UTC).isoformat()

            updated = TaskExecution.model_validate(data)
            self._executions[execution_id] = updated
            return updated


# Default storage singleton
_storage_instance: BaseExecutionStorage = InMemoryExecutionStorage()


def get_execution_storage() -> BaseExecutionStorage:
    """Retrieve the active execution storage provider."""
    return _storage_instance


def set_execution_storage(storage: BaseExecutionStorage) -> None:
    """Configure a custom execution storage provider (e.g. for testing or persistent backends)."""
    global _storage_instance
    _storage_instance = storage
