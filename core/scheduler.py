"""
Proactive Scheduler

時間帯に応じたプロアクティブメッセージスケジューラー
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class ProactiveScheduler:
    """プロアクティブメッセージスケジューラ"""
    
    def __init__(self, simple_graph, connection_manager):
        """
        Args:
            simple_graph: SimpleGraphEngineインスタンス
            connection_manager: ConnectionManagerインスタンス
        """
        self.scheduler = AsyncIOScheduler()
        self.simple_graph = simple_graph
        self.manager = connection_manager
    
    async def lunch_push(self):
        """ランチタイムプッシュ（11:00, 11:30, 12:00）"""
        logger.info("[Scheduler] ランチタイムプッシュ開始")
        
        # アクティブな全接続に対してプッシュ
        for session_id in self.manager.get_active_sessions():
            try:
                # プロアクティブ状態を構築
                from .simple_graph_engine import State
                
                state: State = {
                    "messages": [""],
                    "intent": "proactive",
                    "context": {"trigger": "proactive", "time_zone": "lunch"},
                    "response": "",
                    "options": [],
                    "should_push": False,
                    "session_id": session_id
                }
                
                # SimpleGraphで処理
                result = self.simple_graph.invoke(state)
                
                # WebSocket送信
                if result.get("should_push", False):
                    await self.manager.send_personal(session_id, {
                        "type": "proactive",
                        "message": result["response"],
                        "options": result["options"],
                        "timestamp": datetime.now().isoformat()
                    })
                    logger.info(f"[Scheduler] ランチプッシュ送信: {session_id[:8]}...")
            
            except Exception as e:
                logger.error(f"[Scheduler] ランチプッシュエラー ({session_id[:8]}...): {e}")
    
    async def dinner_push(self):
        """ディナータイムプッシュ（17:00, 18:00）"""
        logger.info("[Scheduler] ディナータイムプッシュ開始")
        
        # アクティブな全接続に対してプッシュ
        for session_id in self.manager.get_active_sessions():
            try:
                # プロアクティブ状態を構築
                from .simple_graph_engine import State
                
                state: State = {
                    "messages": [""],
                    "intent": "proactive",
                    "context": {"trigger": "proactive", "time_zone": "dinner"},
                    "response": "",
                    "options": [],
                    "should_push": False,
                    "session_id": session_id
                }
                
                # SimpleGraphで処理
                result = self.simple_graph.invoke(state)
                
                # WebSocket送信
                if result.get("should_push", False):
                    await self.manager.send_personal(session_id, {
                        "type": "proactive",
                        "message": result["response"],
                        "options": result["options"],
                        "timestamp": datetime.now().isoformat()
                    })
                    logger.info(f"[Scheduler] ディナープッシュ送信: {session_id[:8]}...")
            
            except Exception as e:
                logger.error(f"[Scheduler] ディナープッシュエラー ({session_id[:8]}...): {e}")
    
    def start(self):
        """スケジューラ開始"""
        # ランチタイム（11:00, 11:30, 12:00）
        self.scheduler.add_job(self.lunch_push, "cron", hour=11, minute="0,30")
        self.scheduler.add_job(self.lunch_push, "cron", hour=12, minute=0)
        
        # ディナータイム（17:00, 18:00）
        self.scheduler.add_job(self.dinner_push, "cron", hour="17,18", minute=0)
        
        self.scheduler.start()
        logger.info("[Scheduler] ⏰ スケジューラ起動完了")
        logger.info("[Scheduler] - ランチタイム: 11:00, 11:30, 12:00")
        logger.info("[Scheduler] - ディナータイム: 17:00, 18:00")
    
    def shutdown(self):
        """スケジューラ停止"""
        self.scheduler.shutdown()
        logger.info("[Scheduler] スケジューラ停止")

