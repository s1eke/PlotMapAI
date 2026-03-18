from unittest.mock import MagicMock
from services.analysis_runner import _determine_current_stage, _find_incomplete_chunk_indices

def test_determine_current_stage():
    assert _determine_current_stage("idle", 0, 0, False, False) == "idle"
    assert _determine_current_stage("running", 3, 1, False, False) == "chapters"
    assert _determine_current_stage("running", 3, 3, False, False) == "overview"
    assert _determine_current_stage("completed", 3, 3, True, True) == "completed"

def test_find_incomplete_chunk_indices():
    mock_session = MagicMock()
    mock_session.query.return_value.filter_by.return_value.all.return_value = []
    
    chunk1 = MagicMock()
    chunk1.chunk_index = 0
    chunk1.status = "running"
    chunk1.chapter_indices_json = "[1]"
    
    chunk2 = MagicMock()
    chunk2.chunk_index = 1
    chunk2.status = "completed"
    chunk2.chapter_indices_json = "[2]" 
    
    assert _find_incomplete_chunk_indices(mock_session, 1, [chunk1, chunk2]) == {0, 1}
