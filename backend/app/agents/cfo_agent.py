"""
CFOx CFO Agent — agentic loop that drives the AI CFO.

Lives inside the backend package so it shares the same process,
database connections, and service layer. No separate process needed.

Flow per turn:
    User message
        ↓
    Anthropic API (claude-sonnet-4-6, tool_use)
        ↓
    AgentToolExecutor  →  backend services  →  blockchain / DB
        ↓
    Policy engine check (offchain)
        ↓
    Governance contract (onchain enforcement)
        ↓
    Response back to user
"""

import anthropic
import json
import os
from dataclasses import dataclass, field

from .tools.definitions import TOOLS
from .tools.executor import AgentToolExecutor
from .prompts.cfo_system import CFO_SYSTEM_PROMPT

MAX_ITERATIONS = 10


@dataclass
class AgentResponse:
    text: str
    tool_calls: list[dict] = field(default_factory=list)
    proposals_created: list[dict] = field(default_factory=list)
    risk_flags: list[str] = field(default_factory=list)


class CFOAgent:
    """
    CFOx CFO agent.

    Stateless per-request — the full message history is passed in each call.
    Tool execution is handled by AgentToolExecutor which calls backend services
    directly (function calls, not HTTP when running in-process).
    """

    def __init__(
        self,
        backend_url: str,
        backend_api_key: str,
        treasury_id: str,
        anthropic_client: anthropic.Anthropic | None = None,
    ):
        self.client = anthropic_client or anthropic.Anthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        self.treasury_id = treasury_id
        self.executor = AgentToolExecutor(
            backend_url=backend_url,
            api_key=backend_api_key,
            treasury_id=treasury_id,
        )

    async def chat(
        self,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AgentResponse:
        messages = list(history or [])
        messages.append({"role": "user", "content": user_message})

        proposals_created: list[dict] = []
        risk_flags: list[str] = []
        all_tool_calls: list[dict] = []

        for _ in range(MAX_ITERATIONS):
            response = self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=CFO_SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )

            text_parts = [b.text for b in response.content if b.type == "text"]

            if response.stop_reason == "end_turn":
                return AgentResponse(
                    text="\n".join(text_parts),
                    tool_calls=all_tool_calls,
                    proposals_created=proposals_created,
                    risk_flags=risk_flags,
                )

            if response.stop_reason != "tool_use":
                return AgentResponse(text="\n".join(text_parts) or "Unexpected stop.")

            tool_blocks = [b for b in response.content if b.type == "tool_use"]
            messages.append({"role": "assistant", "content": response.content})

            tool_results = []
            for tb in tool_blocks:
                result = await self.executor.execute(tb.name, tb.id, tb.input)
                parsed = json.loads(result.content)

                all_tool_calls.append({"tool": tb.name, "inputs": tb.input, "result": parsed})

                if tb.name == "create_payment_proposal" and not result.is_error:
                    if parsed.get("proposal_id"):
                        proposals_created.append(parsed)

                if tb.name == "detect_anomaly" and not result.is_error:
                    if parsed.get("risk_level") in ("HIGH", "CRITICAL"):
                        risk_flags.extend(parsed.get("concerns", []))

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": result.content,
                    "is_error": result.is_error,
                })

            messages.append({"role": "user", "content": tool_results})

        return AgentResponse(
            text="Reached reasoning limit. Please simplify your request.",
            tool_calls=all_tool_calls,
            proposals_created=proposals_created,
            risk_flags=risk_flags,
        )

    async def stream_chat(self, user_message: str, history: list[dict] | None = None):
        """Yields text chunks for SSE streaming."""
        messages = list(history or [])
        messages.append({"role": "user", "content": user_message})

        for _ in range(MAX_ITERATIONS):
            with self.client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=CFO_SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            ) as stream:
                for event in stream:
                    if hasattr(event, "type") and event.type == "content_block_delta":
                        if hasattr(event.delta, "text"):
                            yield event.delta.text

                final = stream.get_final_message()
                stop_reason = final.stop_reason
                full_content = final.content
                tool_blocks = [b for b in full_content if b.type == "tool_use"]

            if stop_reason == "end_turn" or stop_reason != "tool_use":
                return

            messages.append({"role": "assistant", "content": full_content})
            tool_results = []
            for tb in tool_blocks:
                yield f"\n\n_Checking {tb.name.replace('_', ' ')}…_\n"
                result = await self.executor.execute(tb.name, tb.id, tb.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": result.content,
                    "is_error": result.is_error,
                })
            messages.append({"role": "user", "content": tool_results})
