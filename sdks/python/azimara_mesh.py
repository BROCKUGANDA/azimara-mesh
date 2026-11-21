"""Azimara Mesh Python SDK — mirrors docs/engineering/openapi-v1.yaml."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional


class MeshError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code


@dataclass
class Page:
    data: list[dict[str, Any]]
    has_more: bool
    next_cursor: Optional[str]


class MeshClient:
    def __init__(self, api_key: str, base_url: str = "https://mesh.aiazimara.com/api/v1", timeout: float = 30.0):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _request(self, path: str, method: str = "GET", body: Optional[dict] = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as exc:
            payload = json.loads(exc.read().decode() or "{}")
            err = payload.get("error", {})
            raise MeshError(exc.code, err.get("code", "UNKNOWN"), err.get("message", exc.reason))

    @staticmethod
    def _query(params: dict[str, Any]) -> str:
        clean = {k: v for k, v in params.items() if v is not None}
        return ("?" + urllib.parse.urlencode(clean)) if clean else ""

    def list_agents(self, limit: int = 25, cursor: Optional[str] = None) -> Page:
        payload = self._request("/agents" + self._query({"limit": limit, "cursor": cursor}))
        pg = payload.get("pagination", {})
        return Page(payload.get("data", []), bool(pg.get("hasMore")), pg.get("nextCursor"))

    def list_executions(self, limit: int = 25, cursor: Optional[str] = None, status: Optional[str] = None) -> Page:
        payload = self._request("/executions" + self._query({"limit": limit, "cursor": cursor, "status": status}))
        pg = payload.get("pagination", {})
        return Page(payload.get("data", []), bool(pg.get("hasMore")), pg.get("nextCursor"))

    def start_execution(self, agent_id: str, input: Optional[dict] = None) -> dict[str, Any]:
        return self._request("/executions", "POST", {"agentId": agent_id, "input": input or {}})

    def cancel_execution(self, execution_id: str) -> dict[str, Any]:
        return self._request(f"/executions/{urllib.parse.quote(execution_id, safe='')}/cancel", "POST")
