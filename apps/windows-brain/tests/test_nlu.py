import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.nlu import NLUEngine
from app.orchestrator import LLMOrchestrator

class MockOrchestrator(LLMOrchestrator):
    def _generate_with_provider_llm(self, *args, **kwargs):
        prompt = kwargs.get("assembled_prompt", "")
        print("MOCK PROMPT:", prompt)
        if "첫줄의 글자 크기를 30pt로 만들어" in prompt:
            return '{"intent": "style_update", "entities": {"raw": "첫줄의 글자 크기를 30pt로 만들어", "target_scope": "first_line"}, "actions": [{"type": "set_font_size", "value": "30", "target_scope": "first_line"}]}'
        elif "첫 줄의 글자 크기를 20pt로 변경해줘" in prompt:
            return '{"intent": "style_update", "entities": {"raw": "첫 줄의 글자 크기를 20pt로 변경해줘", "target_scope": "first_line"}, "actions": [{"type": "set_font_size", "value": "20", "target_scope": "first_line"}]}'
        elif "first line bold" in prompt:
            return '{"intent": "style_update", "entities": {"raw": "first line bold", "target_scope": "first_line"}, "actions": [{"type": "set_bold", "value": "true", "target_scope": "first_line"}]}'
        elif "문서 전체 글꼴을 맑은 고딕으로" in prompt:
            return '{"intent": "style_update", "entities": {"raw": "문서 전체 글꼴을 맑은 고딕으로", "target_scope": "all"}, "actions": [{"type": "set_font_family", "value": "Malgun Gothic", "target_scope": "all"}]}'
        return '{"intent": "general_automation", "entities": {"raw": "", "target_scope": "all"}, "actions": []}'

def test_nlu_parse_first_line():
    engine = NLUEngine()
    orchestrator = MockOrchestrator()
    provider = "mock"
    profile = {}
    
    # Test "첫줄"
    result1 = engine.parse("첫줄의 글자 크기를 30pt로 만들어", orchestrator=orchestrator, provider=provider, auth_profile=profile)
    assert any(action.get("target_scope") == "first_line" for action in result1.actions)
    assert any(action.get("type") == "set_font_size" and action.get("value") == "30" for action in result1.actions)
    
    # Test "첫 줄" (with space)
    result2 = engine.parse("첫 줄의 글자 크기를 20pt로 변경해줘", orchestrator=orchestrator, provider=provider, auth_profile=profile)
    assert any(action.get("target_scope") == "first_line" for action in result2.actions)
    assert any(action.get("type") == "set_font_size" and action.get("value") == "20" for action in result2.actions)

    # Test "first line"
    result3 = engine.parse("first line bold", orchestrator=orchestrator, provider=provider, auth_profile=profile)
    assert any(action.get("target_scope") == "first_line" for action in result3.actions)
    assert any(action.get("type") == "set_bold" and action.get("value") == "true" for action in result3.actions)

def test_nlu_parse_all():
    engine = NLUEngine()
    orchestrator = MockOrchestrator()
    provider = "mock"
    profile = {}
    
    # Test "전체"
    result = engine.parse("문서 전체 글꼴을 맑은 고딕으로", orchestrator=orchestrator, provider=provider, auth_profile=profile)
    assert any(action.get("target_scope") == "all" for action in result.actions)
    assert any(action.get("type") == "set_font_family" and action.get("value") == "Malgun Gothic" for action in result.actions)

if __name__ == "__main__":
    test_nlu_parse_first_line()
    test_nlu_parse_all()
    print("All tests passed!")
