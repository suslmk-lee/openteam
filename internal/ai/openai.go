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
	BaseURL string
	lastUsage OpenAIUsage
}

type OpenAIUsage struct {
	Model            string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
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
	Model string `json:"model"`
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

func NewClient(apiKey, model string, baseURL ...string) *Client {
	if model == "" {
		model = "gpt-4o-mini"
	}

	resolvedBaseURL := DefaultOpenAIBaseURL
	if len(baseURL) > 0 {
		if trimmed := strings.TrimSpace(baseURL[0]); trimmed != "" {
			resolvedBaseURL = strings.TrimRight(trimmed, "/")
		}
	}

	return &Client{
		APIKey:  apiKey,
		Model:   model,
		BaseURL: resolvedBaseURL,
	}
}

func (c *Client) chatCompletionsURL() string {
	base := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if base == "" {
		base = DefaultOpenAIBaseURL
	}
	return base + "/chat/completions"
}

func (c *Client) LastUsage() OpenAIUsage {
	return c.lastUsage
}

func (c *Client) rememberUsage(model string, promptTokens, completionTokens, totalTokens int) {
	if strings.TrimSpace(model) == "" {
		model = c.Model
	}
	if totalTokens == 0 {
		totalTokens = promptTokens + completionTokens
	}
	c.lastUsage = OpenAIUsage{
		Model:            strings.TrimSpace(model),
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      totalTokens,
	}
}

func (c *Client) GenerateReportSentence(source, section, category, title, summary, activityDate string) (string, error) {
	if strings.TrimSpace(c.APIKey) == "" {
		return "", fmt.Errorf("openai api key is empty")
	}

	systemPrompt := "?덈뒗 SI?ъ뾽? 二쇨컙?낅Т 蹂닿퀬?쒕? ?묒꽦?섎뒗 蹂댁“?먮떎. ?ъ슜?먭? ?좏깮???쒕룞(硫붿씪/罹섎┛???댁뒋/硫붿떊? ??? ?낅Т 愿?⑥쑝濡?媛꾩＜?쒕떎. ?묒? 蹂닿퀬???ㅼ뿉 留욎떠 ?쒖닠?뺤쑝濡??묒꽦?섎릺, ?먮Ц 蹂듬텤 ?뺥깭瑜?湲덉??쒕떎."
	userPrompt := fmt.Sprintf(
		"[?낅젰]\n?쒕룞 ?좏삎: %s\n蹂닿퀬???뱀뀡: %s\n移댄뀒怨좊━: %s\n?쒕룞 ?쒕ぉ: %s\n?쒕룞 ?붿빟: %s\n?쇱옄: %s\n\n[?묒꽦 洹쒖튃]\n- ?꾨옒 怨좎젙 ?쒗뵆由우쑝濡??뺥솗??2以??묒꽦\n- ?뺤떇:\n  1) 吏꾪뻾?낅Т: ...\n  2) ?꾩냽議곗튂: ...\n- ?쒖뒪??硫뷀??곗씠??raw 濡쒓렇, 二쇱냼, ID ??瑜?洹몃?濡??곗? 留?寃?n- 怨쇱옣/異붿륫 湲덉?, ?낅Т 留λ씫 以묒떖\n- 媛?以꾩? 80???대궡\n",
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
	req, err := http.NewRequest(http.MethodPost, c.chatCompletionsURL(), bytes.NewReader(body))
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
	c.rememberUsage(parsed.Model, parsed.Usage.PromptTokens, parsed.Usage.CompletionTokens, parsed.Usage.TotalTokens)
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

	systemPrompt := "?덈뒗 SI?ъ뾽? 二쇨컙?낅Т 蹂닿퀬?쒕? ?묒꽦?섎뒗 蹂댁“?먮떎. 媛숈? 二쇱젣???쒕룞 ?щ윭 嫄?硫붿씪/罹섎┛???댁뒋/硫붿떊? ?????섎굹??蹂닿퀬 ??ぉ?쇰줈 痍⑦빀???묒꽦?쒕떎. ?먮Ц 蹂듬텤?대굹 硫뷀??뺣낫 ?섏뿴??湲덉??쒕떎."
	userPrompt := fmt.Sprintf(
		"[?낅젰]\n蹂닿퀬???뱀뀡: %s\n移댄뀒怨좊━: %s\n二쇱젣: %s\n?쒕룞 嫄댁닔: %d\n\n[?쒕룞 紐⑸줉]\n- %s\n\n[?묒꽦 洹쒖튃]\n- ?숈씪 二쇱젣 ?쒕룞?ㅼ쓣 ?섎굹??蹂닿퀬 ??ぉ?쇰줈 ?듯빀???묒꽦\n- ?꾨옒 怨좎젙 ?쒗뵆由우쑝濡??뺥솗??2以??묒꽦\n- ?뺤떇:\n  1) 吏꾪뻾?낅Т: ...\n  2) ?꾩냽議곗튂: ...\n- ?쒕ぉ/?붿빟/濡쒓렇瑜?洹몃?濡?蹂듭궗?섏? 留먭퀬 二쇨컙 吏꾪뻾 ?먮쫫?쇰줈 ?붿빟\n- raw 硫뷀??뺣낫, ?대? ID, 二쇱냼 ?섏뿴 湲덉?\n- 怨쇱옣/異붿륫 湲덉?, ?낅Т 留λ씫 以묒떖\n- 媛?以꾩? 100???대궡\n",
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
	req, err := http.NewRequest(http.MethodPost, c.chatCompletionsURL(), bytes.NewReader(body))
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
	c.rememberUsage(parsed.Model, parsed.Usage.PromptTokens, parsed.Usage.CompletionTokens, parsed.Usage.TotalTokens)
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
		text = strings.ReplaceAll(text, " 2) ", "\n2) ")
		text = strings.ReplaceAll(text, " 2)", "\n2)")
		text = strings.ReplaceAll(text, " 2) ?꾩냽議곗튂:", "\n2) ?꾩냽議곗튂:")
		text = strings.ReplaceAll(text, "2) ?꾩냽議곗튂:", "\n2) ?꾩냽議곗튂:")

		if !strings.Contains(text, "\n") && strings.Contains(text, "吏꾪뻾?낅Т:") && strings.Contains(text, "?꾩냽議곗튂:") {
			idx := strings.Index(text, "?꾩냽議곗튂:")
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
		if strings.HasPrefix(line, "吏꾪뻾?낅Т:") {
			return "1) " + line + "\n2) ?꾩냽議곗튂: 愿???댁슜 寃?????꾩슂???꾩냽 ??묒쓣 吏꾪뻾??"
		}
		if strings.HasPrefix(line, "1) 吏꾪뻾?낅Т:") {
			return line + "\n2) ?꾩냽議곗튂: 愿???댁슜 寃?????꾩슂???꾩냽 ??묒쓣 吏꾪뻾??"
		}
		return "1) 吏꾪뻾?낅Т: " + line + "\n2) ?꾩냽議곗튂: 愿???댁슜 寃?????꾩슂???꾩냽 ??묒쓣 吏꾪뻾??"
	}

	first := lines[0]
	second := lines[1]

	if strings.HasPrefix(first, "吏꾪뻾?낅Т:") {
		first = "1) " + first
	} else if !strings.HasPrefix(first, "1) 吏꾪뻾?낅Т:") {
		first = "1) 吏꾪뻾?낅Т: " + first
	}

	if strings.HasPrefix(second, "?꾩냽議곗튂:") {
		second = "2) " + second
	} else if !strings.HasPrefix(second, "2) ?꾩냽議곗튂:") {
		second = "2) ?꾩냽議곗튂: " + second
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

	req, err := http.NewRequest("POST", c.chatCompletionsURL(), bytes.NewReader(bodyBytes))
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
		Model string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
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
	c.rememberUsage(result.Model, result.Usage.PromptTokens, result.Usage.CompletionTokens, result.Usage.TotalTokens)
	return result.Choices[0].Message.Content, nil
}
