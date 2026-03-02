import logging
import os
import httpx

logger = logging.getLogger(__name__)

_api_key = None
_client = None

def init_search():
    global _api_key, _client
    _api_key = os.getenv("BRAVE_SEARCH_API_KEY")
    if not _api_key:
        logger.warning("BRAVE_SEARCH_API_KEY not set - search will be unavailable")
    _client = httpx.AsyncClient()
    logger.info("Search service initialized")

async def cleanup_search():
    global _client
    if _client:
        await _client.aclose()
    _client = None
    logger.info("Search service cleaned up")

async def search_web(query: str, count: int = 5) -> dict:
    """Execute a Brave web search and return formatted results with structured sources."""
    if not _api_key:
        return {"text": "Search unavailable: BRAVE_SEARCH_API_KEY not configured", "sources": []}

    logger.info(f"Searching: {query}")
    resp = await _client.get(
        "https://api.search.brave.com/res/v1/web/search",
        headers={
            "X-Subscription-Token": _api_key,
            "Accept": "application/json",
        },
        params={"q": query, "count": count},
    )
    resp.raise_for_status()
    data = resp.json()

    results = []
    sources = []
    for item in data.get("web", {}).get("results", []):
        title = item.get("title", "")
        url = item.get("url", "")
        description = item.get("description", "")
        results.append(f"**{title}**\n{url}\n{description}")
        if title and url:
            sources.append({"title": title, "url": url})

    formatted = "\n\n".join(results) if results else "No results found."
    logger.info(f"Search '{query}': {len(results)} results")
    return {"text": formatted, "sources": sources}
