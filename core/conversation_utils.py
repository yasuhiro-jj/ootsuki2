"""
会話履歴を LangChain のメッセージ列に組み立てるユーティリティ。

conversation_turns: 現在のユーザー発話より前の user/assistant のみ（system は含めない）。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage


def build_chat_messages(
    system_prompt: str,
    conversation_turns: List[Dict[str, str]],
    current_user_message: str,
    system_suffix: Optional[str] = None,
) -> List[Any]:
    """
    System → 過去ターン（Human / AI 交互）→ 今回の Human の順で LLM に渡す。
    """
    text = system_prompt
    if system_suffix:
        text = f"{text}\n\n{system_suffix}"

    msgs: List[Any] = [SystemMessage(content=text)]
    for t in conversation_turns:
        role = t.get("role", "")
        content = t.get("content", "")
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))
    msgs.append(HumanMessage(content=current_user_message))
    return msgs
