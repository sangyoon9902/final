# server/routers/results.py
from fastapi import APIRouter

# 지금은 /results API를 사용하지 않으므로, 라우터는 placeholder로 남겨둠.
router = APIRouter(prefix="/results", tags=["results"])

@router.get("")
def disabled_results_route():
    """현재는 /session_summary가 결과 저장을 담당하므로 이 라우터는 비활성화됨."""
    return {
        "detail": "결과 저장은 /session_summary 엔드포인트에서 자동 처리됩니다.",
        "enabled": False,
    }
