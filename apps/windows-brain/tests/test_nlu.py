
import sys
import os

# Add the parent directory to sys.path to allow importing from app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.nlu import NLUEngine

def test_nlu_parse_first_line():
    engine = NLUEngine()
    
    # Test "첫줄"
    result1 = engine.parse("첫줄의 글자 크기를 30pt로 만들어", orchestrator=None, provider=None, auth_profile=None)
    assert result1.entities.get("target_scope") == "first_line"
    assert any(action.get("type") == "set_font_size" and action.get("value") == "30" for action in result1.actions)
    
    # Test "첫 줄" (with space)
    result2 = engine.parse("첫 줄의 글자 크기를 20pt로 변경해줘", orchestrator=None, provider=None, auth_profile=None)
    assert result2.entities.get("target_scope") == "first_line"
    assert any(action.get("type") == "set_font_size" and action.get("value") == "20" for action in result2.actions)

    # Test "first line"
    result3 = engine.parse("first line bold", orchestrator=None, provider=None, auth_profile=None)
    assert result3.entities.get("target_scope") == "first_line"
    assert any(action.get("type") == "set_bold" and action.get("value") == "true" for action in result3.actions)

def test_nlu_parse_all():
    engine = NLUEngine()
    
    # Test "전체"
    result = engine.parse("문서 전체 글꼴을 맑은 고딕으로", orchestrator=None, provider=None, auth_profile=None)
    assert result.entities.get("target_scope") == "all"
    assert any(action.get("type") == "set_font_family" and action.get("value") == "Malgun Gothic" for action in result.actions)

if __name__ == "__main__":
    test_nlu_parse_first_line()
    test_nlu_parse_all()
    print("All tests passed!")
