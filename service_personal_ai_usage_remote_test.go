package main

import "testing"

func TestExtractMiniMaxUsageCounters_FindsModelCounters(t *testing.T) {
	payload := map[string]any{
		"base_resp": map[string]any{
			"status_code": 0,
			"status_msg":  "ok",
		},
		"data": map[string]any{
			"text_model": map[string]any{
				"model_name":   "MiniMax-M2.7",
				"used_quota":   120,
				"total_quota":  1500,
				"remain_quota": 1380,
			},
		},
	}

	counters := extractMiniMaxUsageCounters(payload, "")
	if len(counters) == 0 {
		t.Fatalf("expected at least one counter")
	}

	found := false
	for _, counter := range counters {
		if counter.ModelCode == "MiniMax-M2.7" {
			found = true
			if counter.Used != 120 {
				t.Fatalf("expected used=120, got %v", counter.Used)
			}
			if counter.Total != 1500 {
				t.Fatalf("expected total=1500, got %v", counter.Total)
			}
			if counter.Remaining != 1380 {
				t.Fatalf("expected remain=1380, got %v", counter.Remaining)
			}
		}
	}
	if !found {
		t.Fatalf("expected MiniMax-M2.7 counter in parsed counters")
	}
}

func TestBuildMiniMaxUsageDeltas_IncrementalModeUsesDelta(t *testing.T) {
	counter := miniMaxUsageCounter{
		Path:      "data.text_model",
		ModelCode: "MiniMax-M2.7",
		Used:      130,
	}
	stateKey := minimaxCounterStateKey(counter)
	prev := map[string]string{
		stateKey: "100",
	}

	deltas, nextState, warnings := buildMiniMaxUsageDeltas([]miniMaxUsageCounter{counter}, prev, personalCollectRunOptions{
		Incremental: true,
		Trigger:     personalAICollectTriggerAuto,
	})

	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %v", warnings)
	}
	if len(deltas) != 1 {
		t.Fatalf("expected one delta row, got %d", len(deltas))
	}
	if deltas[0].Delta != 30 {
		t.Fatalf("expected delta 30, got %v", deltas[0].Delta)
	}
	if nextState[stateKey] == "" {
		t.Fatalf("expected next state to be updated")
	}
}

func TestBuildMiniMaxUsageDeltas_IncrementalModeWithoutStateImportsInitialSnapshot(t *testing.T) {
	counter := miniMaxUsageCounter{
		Path:      "data.text_model",
		ModelCode: "MiniMax-M2.7",
		Used:      200,
	}

	deltas, nextState, warnings := buildMiniMaxUsageDeltas([]miniMaxUsageCounter{counter}, nil, personalCollectRunOptions{
		Incremental: true,
		Trigger:     personalAICollectTriggerAuto,
	})

	if len(deltas) != 1 {
		t.Fatalf("expected one delta row on first incremental snapshot, got %d", len(deltas))
	}
	if deltas[0].Delta != 200 {
		t.Fatalf("expected imported delta 200, got %v", deltas[0].Delta)
	}
	if len(warnings) == 0 {
		t.Fatalf("expected warning on incremental baseline import")
	}
	stateKey := minimaxCounterStateKey(counter)
	if nextState[stateKey] == "" {
		t.Fatalf("expected baseline state to be written")
	}
}

func TestBuildMiniMaxUsageDeltas_FullCollectionImportsInitialSnapshot(t *testing.T) {
	counter := miniMaxUsageCounter{
		Path:      "data.text_model",
		ModelCode: "MiniMax-M2.7",
		Used:      75,
	}

	deltas, _, warnings := buildMiniMaxUsageDeltas([]miniMaxUsageCounter{counter}, nil, personalCollectRunOptions{
		Incremental: false,
		Trigger:     personalAICollectTriggerManual,
	})

	if len(deltas) != 1 {
		t.Fatalf("expected one imported snapshot delta row, got %d", len(deltas))
	}
	if deltas[0].Delta != 75 {
		t.Fatalf("expected imported delta 75, got %v", deltas[0].Delta)
	}
	if len(warnings) == 0 {
		t.Fatalf("expected warning for initial snapshot import")
	}
}
