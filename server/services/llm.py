import logging
from typing import AsyncIterator, Optional, Callable, Awaitable

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
    tool,
    create_sdk_mcp_server,
)

logger = logging.getLogger(__name__)

# Module-level reference to the current tool handler, set per get_response call
_current_tool_handler: Optional[Callable[[str, dict], Awaitable[str]]] = None


def init_llm():
    logger.info("LLM service initialized (claude-agent-sdk)")


def cleanup_llm():
    logger.info("LLM service cleaned up")


def _format_messages_as_prompt(messages: list[dict]) -> str:
    """Convert a list of role/content message dicts into a single prompt string.

    The Claude Agent SDK takes a single prompt, not a message history.
    We format prior messages as context so Claude sees the full conversation.
    """
    if not messages:
        return ""

    # If there's only one message, just return its content
    if len(messages) == 1:
        return messages[-1]["content"]

    # Format conversation history as context, with the last user message as the prompt
    parts = []
    for msg in messages[:-1]:
        role_label = "User" if msg["role"] == "user" else "Assistant"
        parts.append(f"{role_label}: {msg['content']}")

    history = "\n\n".join(parts)
    last_msg = messages[-1]["content"]

    return (
        f"Here is our conversation so far:\n\n{history}\n\n"
        f"Now respond to this message:\n\n{last_msg}"
    )


async def get_response(
    messages: list[dict],
    system_prompt: str,
    tool_handler: Optional[Callable[[str, dict], Awaitable[str]]] = None,
) -> AsyncIterator[dict]:
    """Stream a response from Claude via the Agent SDK with tool use support.

    Yields event dicts:
    - {"type": "delta", "content": str} - text chunk
    - {"type": "tool_use", "tool": str, "input": dict, "tool_use_id": str} - tool call
    - {"type": "tool_result", "content": str} - tool result
    - {"type": "complete", "content": str} - final complete text
    """
    global _current_tool_handler
    _current_tool_handler = tool_handler

    prompt = _format_messages_as_prompt(messages)

    # Build MCP server with search_web tool if we have a tool handler
    mcp_servers = {}
    allowed_tools = []
    if tool_handler:
        search_tool = _build_search_tool()
        sdk_server = create_sdk_mcp_server(
            name="app-tools",
            version="1.0.0",
            tools=[search_tool],
        )
        mcp_servers["app-tools"] = sdk_server
        allowed_tools.append("mcp__app-tools__search_web")

    options = ClaudeAgentOptions(
        system_prompt=system_prompt or "You are a helpful assistant.",
        model="sonnet",
        max_turns=10,
        mcp_servers=mcp_servers,
        allowed_tools=allowed_tools,
        permission_mode="bypassPermissions",
    )

    collected_text = ""

    try:
        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)

            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            # Yield the full text block as a delta
                            if block.text:
                                collected_text += block.text
                                yield {"type": "delta", "content": block.text}
                        elif isinstance(block, ToolUseBlock):
                            yield {
                                "type": "tool_use",
                                "tool": block.name,
                                "input": block.input,
                                "tool_use_id": block.id,
                            }
                        elif isinstance(block, ToolResultBlock):
                            content = block.content if isinstance(block.content, str) else str(block.content)
                            yield {"type": "tool_result", "content": content}

                elif isinstance(message, ResultMessage):
                    # Final result - use result text if available, otherwise collected_text
                    if message.result:
                        collected_text = message.result
                    break

    except Exception as e:
        logger.error("Agent SDK error: %s", e)
        yield {"type": "complete", "content": f"Error: {e}"}
        return
    finally:
        _current_tool_handler = None

    yield {"type": "complete", "content": collected_text}


def _build_search_tool():
    """Build the search_web tool using the @tool decorator."""

    @tool(
        "search_web",
        "Search the web for current information. Use when the user asks about recent events, needs up-to-date data, or asks you to search or look something up.",
        {"query": str},
    )
    async def search_web(args):
        query = args.get("query", "")
        if _current_tool_handler:
            result = await _current_tool_handler("search_web", {"query": query})
        else:
            result = "Search tool not available"
        return {"content": [{"type": "text", "text": result}]}

    return search_web
