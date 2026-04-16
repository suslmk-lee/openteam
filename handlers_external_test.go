package main

import "testing"

func TestLooksLikeEncodingIssueReply(t *testing.T) {
	bad := "I see your message has encoding issues and is difficult to read. Could you please resend your message using proper encoding?"
	if !looksLikeEncodingIssueReply(bad) {
		t.Fatalf("expected encoding-issue reply to be detected")
	}

	good := "프로젝트 API 인증 로직을 개선하고, 사용자 권한 모델을 정리했습니다."
	if looksLikeEncodingIssueReply(good) {
		t.Fatalf("expected normal report text not to be detected as encoding issue")
	}
}

func TestNormalizeLinearNarrativeContent(t *testing.T) {
	got := normalizeLinearNarrativeContent("프로젝트 A\n인증 API 개선\n테스트 코드 보강")
	if got == "" {
		t.Fatalf("expected normalized content")
	}
	if looksLikeEncodingIssueReply(got) {
		t.Fatalf("normalized content should not look like encoding issue")
	}
	if got != "프로젝트 A\n- 진행 내용: 인증 API 개선\n- 차주 계획: 테스트 코드 보강" {
		t.Fatalf("unexpected normalized output: %q", got)
	}
}
