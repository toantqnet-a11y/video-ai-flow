"""Edge TTS subprocess boundary.

Read text privately from stdin instead of placing scripts in process arguments.
The worker prints no content, no voice samples and no provider exception payloads.
Exit codes are a stable, minimal contract to the Node adapter.
"""
import asyncio
import json
import sys


def main():
    try:
        import edge_tts
    except ImportError:
        return 20  # dependency unavailable
    if len(sys.argv) == 2 and sys.argv[1] == "--check":
        return 0
    try:
        payload = json.load(sys.stdin)
        communicator = edge_tts.Communicate(
            payload["text"], payload["voice"],
            rate=f'{int(payload.get("rate", 0)):+d}%',
            connect_timeout=10, receive_timeout=45,
        )
        asyncio.run(communicator.save(payload["outputPath"]))
        return 0
    except (KeyError, ValueError, TypeError):
        return 21  # invalid request
    except Exception:
        return 22  # upstream network/service failure; deliberately no private data


if __name__ == "__main__":
    sys.exit(main())
