# =========================================
# 🍣 おおつきチャットボット
# LangGraph × NotionDB × 人間味会話テンプレート
# =========================================

import os
from typing import List, Dict, Any
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_core.messages import HumanMessage, AIMessage
from langchain.memory import ConversationBufferMemory
from notion_client import Client
from dotenv import load_dotenv

# .envファイルを読み込む
load_dotenv()

# ========= .env の設定 =========
# .env ファイルに以下を記入してください：
# NOTION_API_KEY=あなたのAPIキー
# NOTION_DB_ID=あなたのDB ID（会話フロー定義用）
# OPENAI_API_KEY=あなたのOpenAIキー
# =================================

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_DB_ID = os.getenv("NOTION_DB_CONVERSATION")  # 会話フローDB
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# ===== モデル設定 =====
MODEL_NAME = "gpt-4o-mini"
llm = ChatOpenAI(model=MODEL_NAME, temperature=0.8, api_key=OPENAI_API_KEY)  # 人間味を出すため0.8
notion = Client(auth=NOTION_API_KEY) if NOTION_API_KEY else None
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)

# ===== 人間味のあるシステムプロンプト =====
HUMAN_LIKE_PROMPT = """
あなたは日本の小料理屋「食事処おおつき」で働くAIスタッフです。
接客時は、温かく、思いやりを込めて、人間らしい自然な会話を行ってください。

🎯【目的】
お客様に安心感と心地よさを与え、自然な会話でコミュニケーションを楽しんでもらう。

💡【会話スタイル指針】
1. 声のトーン：丁寧だけど堅すぎず、笑顔を感じる口調。
2. 相づち：「そうなんですね」「なるほど」「いいですね！」を自然に入れる。
3. 感情語：「うれしい」「残念」「助かります」などを適度に使う。
4. 共感＋提案：「たしかに寒いですね。温かいお味噌汁でもいかがですか？」のように。
5. 一文を短く、やわらかく。
6. お店らしさ：「今日はアジがいい感じに脂のってますよ〜」など、自然な雑談を交える。

💬【会話例】
- 「いらっしゃいませ！今日は風が冷たいですね〜、温かいお茶お出ししますね。」
- 「あ、光物お好きなんですね！アジがちょうどいい塩加減なんですよ。」
- 「ビールですか？いいですね〜！唐揚げと一緒にいかがですか？」

お客様の発言：
{user_message}
"""

# ===== Notionノード読込 =====
def load_notion_nodes() -> Dict[str, Dict[str, Any]]:
    """Notionから会話フローノードを読み込む（Relation型対応）"""
    if not notion or not NOTION_DB_ID:
        print("⚠️ Notion設定がありません。デフォルトフローを使用します。")
        return {}
    
    try:
        results = notion.databases.query(database_id=NOTION_DB_ID)
        nodes = {}
        
        for item in results["results"]:
            props = item["properties"]
            
            # node_id（Title型）
            node_id = ""
            if "node_id" in props and props["node_id"].get("title"):
                node_id = props["node_id"]["title"][0].get("plain_text", "")
            # 日本語プロパティ名にも対応
            elif "ノード名（node_name）" in props and props["ノード名（node_name）"].get("title"):
                node_id = props["ノード名（node_name）"]["title"][0].get("plain_text", "")
            
            # response_template（Text/Rich Text型）
            response = ""
            if "response_template" in props:
                if props["response_template"].get("rich_text"):
                    response = props["response_template"]["rich_text"][0].get("plain_text", "")
                elif props["response_template"].get("plain_text"):
                    response = props["response_template"].get("plain_text", "")
            # 日本語プロパティ名にも対応
            elif "応答テンプレート（response_template）" in props:
                prop = props["応答テンプレート（response_template）"]
                if prop.get("rich_text"):
                    response = prop["rich_text"][0].get("plain_text", "")
            
            # next_node（Relation型対応）
            next_node_id = ""
            if "next_node" in props:
                next_refs = props["next_node"].get("relation", [])
                next_node_id = next_refs[0]["id"] if next_refs else ""
            # 日本語プロパティ名にも対応
            elif "次のノード（next_node）" in props:
                next_refs = props["次のノード（next_node）"].get("relation", [])
                next_node_id = next_refs[0]["id"] if next_refs else ""
            
            # trigger_keywords（Text型：カンマ区切り対応）
            keywords = []
            if "trigger_keywords" in props:
                if props["trigger_keywords"].get("rich_text"):
                    keywords_text = props["trigger_keywords"]["rich_text"][0].get("plain_text", "")
                    keywords = [k.strip() for k in keywords_text.split(",") if k.strip()]
            # 日本語プロパティ名にも対応
            elif "トリガーワード（trigger_words）" in props:
                prop = props["トリガーワード（trigger_words）"]
                if prop.get("rich_text"):
                    keywords_text = prop["rich_text"][0].get("plain_text", "")
                    keywords = [k.strip() for k in keywords_text.split(",") if k.strip()]
            
            # auto_advance（Checkbox型）
            auto_advance = False
            if "auto_advance" in props:
                auto_advance = props["auto_advance"].get("checkbox", False)
            
            # advance_limit（Number型）
            advance_limit = 0
            if "advance_limit" in props:
                advance_limit = props["advance_limit"].get("number", 0)
            
            if node_id:
                nodes[node_id] = {
                    "response": response,
                    "next": next_node_id,
                    "keywords": keywords,
                    "auto_advance": auto_advance,
                    "advance_limit": advance_limit,
                    "notion_id": item["id"]  # Notion上のページIDも保存
                }
        
        print(f"✅ Notionから{len(nodes)}個の会話ノードを読み込みました（Relation対応）")
        return nodes
    
    except Exception as e:
        print(f"❌ Notion読み込みエラー: {e}")
        import traceback
        print(f"詳細: {traceback.format_exc()}")
        return {}


nodes = load_notion_nodes()

# ===== 状態管理 =====
class State(dict):
    messages: List[Dict[str, Any]]
    exit: bool = False
    next_node: str = "user_input"

# ===== ノード定義 =====
def user_input_node(state: State):
    """ユーザー入力ノード"""
    user_message = input("\n👤 お客様: ")
    
    if user_message.lower() in ["終了", "end", "bye", "exit"]:
        return {"messages": [HumanMessage(content="終了")], "exit": True}
    
    return {"messages": [HumanMessage(content=user_message)], "exit": False}


def chatbot_node(state: State):
    """チャットボット応答ノード"""
    if not state.get("messages"):
        return {"messages": [], "exit": False}
    
    user_msg = state["messages"][-1].content
    
    # 終了判定
    if user_msg == "終了":
        return {"messages": [AIMessage(content="")], "exit": True}
    
    matched_node = None

    # Notionノードとのマッチング
    for node_id, node_data in nodes.items():
        if node_data["keywords"]:
            if any(keyword in user_msg for keyword in node_data["keywords"]):
                matched_node = node_data
                break

    # === ノードに一致した場合 ===
    if matched_node:
        response = matched_node["response"]
        next_id = matched_node["next"]
        auto_advance = matched_node.get("auto_advance", False)
        advance_limit = matched_node.get("advance_limit", 0)
        
        print(f"\n🤖 店員: {response}")
        
        # --- 自動進行機能（auto_advance対応）---
        if auto_advance and next_id:
            # Relation型なので、next_idはNotion IDになっている
            # nodes辞書内でnotion_idが一致するノードを検索
            advance_count = 0
            current_next_id = next_id
            all_responses = [response]
            
            while advance_count < advance_limit and current_next_id:
                # notion_idで検索
                follow_node = None
                for node_key, node_data in nodes.items():
                    if node_data.get("notion_id") == current_next_id:
                        follow_node = node_data
                        break
                
                if follow_node:
                    follow_response = follow_node["response"]
                    print(f"\n🤖 店員（続き{advance_count + 1}）: {follow_response}")
                    all_responses.append(follow_response)
                    
                    # 次のノードへ
                    current_next_id = follow_node.get("next", "")
                    advance_count += 1
                    
                    # 次のノードもauto_advanceかチェック
                    if not follow_node.get("auto_advance", False):
                        break
                else:
                    break
            
            # 全応答を結合
            response = "\n\n".join(all_responses)
            next_id = current_next_id if current_next_id else "user_input"
        
        # --- 手動遷移（auto_advanceがfalseの場合の従来機能）---
        elif next_id:
            # Relation型対応: notion_idで検索
            follow_node = None
            for node_key, node_data in nodes.items():
                if node_data.get("notion_id") == next_id:
                    follow_node = node_data
                    break
            
            if follow_node:
                follow_response = follow_node["response"]
                print(f"\n🤖 店員（続き）: {follow_response}")
                next_id = follow_node.get("next", "user_input")
                response = response + "\n\n" + follow_response
    else:
        # === 一致なし：LLMで人間味のある接客トーンで回答 ===
        try:
            prompt = HUMAN_LIKE_PROMPT.format(user_message=user_msg)
            ai_response = llm.invoke([HumanMessage(content=prompt)])
            response = ai_response.content
            next_id = "user_input"
            print(f"\n🤖 店員: {response}")
        except Exception as e:
            print(f"\n🤖 店員: 申し訳ございません、少々お待ちください...")
            print(f"❌ エラー: {e}")
            response = "申し訳ございません、少々お待ちください..."
            next_id = "user_input"

    return {"messages": [AIMessage(content=response)], "next_node": next_id, "exit": False}


def check_exit(state: State) -> str:
    """終了判定"""
    if state.get("exit"):
        return "end"
    return "continue"


# ===== LangGraph定義 =====
graph_builder = StateGraph(State)
graph_builder.add_node("user_input", user_input_node)
graph_builder.add_node("chatbot", chatbot_node)

graph_builder.add_edge(START, "user_input")
graph_builder.add_edge("user_input", "chatbot")

# 条件分岐
graph_builder.add_conditional_edges(
    "chatbot",
    check_exit,
    {
        "continue": "user_input",
        "end": END
    }
)

graph = graph_builder.compile()


# ===== メインループ =====
def main():
    print("=" * 60)
    print("🍣 おおつきチャットボット起動中")
    print("   LangGraph × NotionDB × 人間味会話")
    print("=" * 60)
    print("\n💡 「終了」または「exit」で終了します")
    
    if not OPENAI_API_KEY:
        print("\n❌ OPENAI_API_KEYが設定されていません")
        print("   .envファイルにOPENAI_API_KEYを追加してください")
        return
    
    if not NOTION_API_KEY:
        print("\n⚠️ NOTION_API_KEYが設定されていません")
        print("   NotionDBなしでLLMのみで動作します")
    
    print("\n🎉 準備完了！会話を開始してください。")
    
    try:
        initial_state = State(messages=[], exit=False)
        
        for event in graph.stream(initial_state):
            # 終了判定
            for key, val in event.items():
                if val.get("exit"):
                    print("\n👋 店員: ご来店ありがとうございました！またお待ちしています！")
                    return
    
    except KeyboardInterrupt:
        print("\n\n👋 店員: ご来店ありがとうございました！またお待ちしています！")
    except Exception as e:
        print(f"\n❌ エラー: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

