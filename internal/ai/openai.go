package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	APIKey string
	Model  string
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func NewClient(apiKey, model string) *Client {
	if model == "" {
		model = "gpt-4o-mini"
	}
	return &Client{APIKey: apiKey, Model: model}
}

func (c *Client) GenerateReportSentence(source, section, category, title, summary, activityDate string) (string, error) {
	if strings.TrimSpace(c.APIKey) == "" {
		return "", fmt.Errorf("openai api key is empty")
	}

	systemPrompt := "너는 SI사업팀 주간업무 보고서를 작성하는 보조자다. 사용자가 선택한 활동(메일/캘린더/이슈/메신저 등)은 업무 관련으로 간주한다. 엑셀 보고서 톤에 맞춰 서술형으로 작성하되, 원문 복붙 형태를 금지한다."
	userPrompt := fmt.Sprintf(
		"[입력]\n활동 유형: %s\n보고서 섹션: %s\n카테고리: %s\n활동 제목: %s\n활동 요약: %s\n일자: %s\n\n[작성 규칙]\n- 아래 고정 템플릿으로 정확히 2줄 작성\n- 형식:\n  1) 진행업무: ...\n  2) 후속조치: ...\n- 시스템 메타데이터(raw 로그, 주소, ID 등)를 그대로 쓰지 말 것\n- 과장/추측 금지, 업무 맥락 중심\n- 각 줄은 80자 이내\n",
		source, section, category, title, summary, activityDate,
	)

	payload := chatRequest{
		Model: c.Model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	httpClient := &http.Client{Timeout: 20 * time.Second}
	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("openai api error (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed chatResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("openai response has no choices")
	}

	result := normalizeReportText(parsed.Choices[0].Message.Content)
	if result == "" {
		return "", fmt.Errorf("openai returned empty content")
	}
	return result, nil
}

func (c *Client) GenerateGroupedReportSentence(section, category, topic string, activityDigests []string) (string, error) {
	if strings.TrimSpace(c.APIKey) == "" {
		return "", fmt.Errorf("openai api key is empty")
	}
	if len(activityDigests) == 0 {
		return "", fmt.Errorf("activity digests are empty")
	}

	systemPrompt := "너는 SI사업팀 주간업무 보고서를 작성하는 보조자다. 같은 주제의 활동 여러 건(메일/캘린더/이슈/메신저 등)을 하나의 보고 항목으로 취합해 작성한다. 원문 복붙이나 메타정보 나열을 금지한다."
	userPrompt := fmt.Sprintf(
		"[입력]\n보고서 섹션: %s\n카테고리: %s\n주제: %s\n활동 건수: %d\n\n[활동 목록]\n- %s\n\n[작성 규칙]\n- 동일 주제 활동들을 하나의 보고 항목으로 통합해 작성\n- 아래 고정 템플릿으로 정확히 2줄 작성\n- 형식:\n  1) 진행업무: ...\n  2) 후속조치: ...\n- 제목/요약/로그를 그대로 복사하지 말고 주간 진행 흐름으로 요약\n- raw 메타정보, 내부 ID, 주소 나열 금지\n- 과장/추측 금지, 업무 맥락 중심\n- 각 줄은 100자 이내\n",
		section, category, topic, len(activityDigests), strings.Join(activityDigests, "\n- "),
	)

	payload := chatRequest{
		Model: c.Model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("openai api error (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed chatResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("openai response has no choices")
	}

	result := normalizeReportText(parsed.Choices[0].Message.Content)
	if result == "" {
		return "", fmt.Errorf("openai returned empty content")
	}
	return result, nil
}

func normalizeReportText(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}

	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	// Model sometimes returns both items in one line: "1) ... 2) ..."
	if !strings.Contains(text, "\n") {
		text = strings.ReplaceAll(text, " 2) 후속조치:", "\n2) 후속조치:")
		text = strings.ReplaceAll(text, "2) 후속조치:", "\n2) 후속조치:")

		if !strings.Contains(text, "\n") && strings.Contains(text, "진행업무:") && strings.Contains(text, "후속조치:") {
			idx := strings.Index(text, "후속조치:")
			if idx > 0 {
				prefix := strings.TrimSpace(text[:idx])
				suffix := strings.TrimSpace(text[idx:])
				text = prefix + "\n" + suffix
			}
		}
	}

	lines := []string{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	if len(lines) == 0 {
		return ""
	}

	if len(lines) == 1 {
		line := lines[0]
		if strings.HasPrefix(line, "진행업무:") {
			return "1) " + line + "\n2) 후속조치: 관련 내용 검토 후 필요한 후속 대응을 진행함."
		}
		if strings.HasPrefix(line, "1) 진행업무:") {
			return line + "\n2) 후속조치: 관련 내용 검토 후 필요한 후속 대응을 진행함."
		}
		return "1) 진행업무: " + line + "\n2) 후속조치: 관련 내용 검토 후 필요한 후속 대응을 진행함."
	}

	first := lines[0]
	second := lines[1]

	if strings.HasPrefix(first, "진행업무:") {
		first = "1) " + first
	} else if !strings.HasPrefix(first, "1) 진행업무:") {
		first = "1) 진행업무: " + first
	}

	if strings.HasPrefix(second, "후속조치:") {
		second = "2) " + second
	} else if !strings.HasPrefix(second, "2) 후속조치:") {
		second = "2) 후속조치: " + second
	}

	return first + "\n" + second
}

// ChatCompletion sends a system prompt + user message to the OpenAI chat API.
func (c *Client) ChatCompletion(systemPrompt, userMessage string) (string, error) {
	reqBody := map[string]interface{}{
		"model": c.Model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Error != nil {
		return "", fmt.Errorf("openai error: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("openai returned empty response")
	}
	return result.Choices[0].Message.Content, nil
}
