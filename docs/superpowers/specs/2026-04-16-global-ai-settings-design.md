# Global AI Settings and Per-Screen Override Design

## 1) Background
- The project currently uses AI in multiple places:
  - Report generation and refinement (backend)
  - Linear issue-to-report conversion (backend)
  - Vault AI chat (frontend + backend mixed path)
- AI settings exist, but usage is not fully unified:
  - OpenAI integration config is stored in DB (`integrations.tool_type = openai`)
  - Report/Linear flows use backend config lookup
  - Chat still uses a frontend-fixed model (`gpt-4o-mini`) and direct OpenAI HTTP call
- User goal:
  - Configure AI provider/model in Settings
  - Apply global defaults app-wide
  - Allow per-screen override only where needed (chat only)
  - Add MiniMax support, with connection mode not yet finalized

## 2) Scope and Non-Goals
### Scope
- Introduce a unified global AI settings model.
- Route all AI features through a shared backend AI gateway.
- Keep per-screen override only for chat.
- Keep report-related AI flows locked to global settings.
- Keep API key storage as local DB plaintext (current policy).

### Non-Goals
- OS keychain/credential-manager migration.
- Full prompt redesign.
- Major UI restructuring outside AI settings and chat model picker.

## 3) Product Decisions (Confirmed)
- Global defaults + per-screen override.
- Chat-only override is allowed.
- Report/Linear AI always use global defaults.
- API key storage remains local DB plaintext.
- MiniMax integration mode is currently unknown, so design must support:
  - OpenAI-compatible mode
  - Provider-specific mode later

## 4) High-Level Architecture
- Add a backend AI gateway layer and make all AI features call it.
- Keep provider-specific implementation behind interfaces.
- Frontend does not call provider APIs directly anymore.

### 4.1 Components
- `AISettingsService` (backend):
  - Read/write global AI settings.
  - Resolve effective provider/model for each feature.
- `AIProvider` interface (backend):
  - Common chat-completion contract.
- Provider implementations:
  - `OpenAICompatibleProvider` (for OpenAI, and MiniMax if compatible)
  - `ClaudeCLIProvider` (existing local CLI path)
- `AIGateway` (backend):
  - Entry point for all feature-level AI calls.
  - Applies policy and delegates to provider implementation.

### 4.2 Data Ownership
- Settings source of truth: `integrations` table.
- New standard integration key: `tool_type = ai` (global AI policy/settings).
- Legacy fallback: `tool_type = openai` remains readable during migration.

## 5) Settings Model Design
Store JSON in `integrations.config_json` for `tool_type = ai`.

```json
{
  "defaultProvider": "openai",
  "policy": {
    "chatAllowOverride": true
  },
  "providers": {
    "openai": {
      "enabled": true,
      "apiKey": "",
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com/v1",
      "mode": "openai_compatible"
    },
    "minimax": {
      "enabled": false,
      "apiKey": "",
      "model": "",
      "baseUrl": "",
      "mode": "unknown"
    },
    "claude_cli": {
      "enabled": true
    }
  }
}
```

Notes:
- `mode` allows deferring MiniMax integration details.
- `baseUrl` supports OpenAI-compatible providers.
- `chatAllowOverride` enforces the confirmed policy.

## 6) Effective-Config Resolution Rules
1. Feature requests AI (`chat`, `report_preprocess`, `report_refine`, `linear_summary`).
2. Gateway loads global AI settings.
3. If feature is chat and override is provided:
  - Validate override and allow only if `chatAllowOverride = true`.
  - Use override provider/model for this request only.
4. Otherwise, use global default provider/model.
5. Validate required credentials/fields for the selected provider.
6. Execute via provider implementation.

## 7) API Design Changes
### 7.1 New/Updated Backend APIs
- `GetAISettings() -> AISettings`
- `SaveAISettings(input: AISettings) -> void`
- `ChatWithAI(prompt, context, override?) -> ChatResult`

Where:
- `override` is only honored for chat and only if policy allows.
- `ChatResult` includes provider/model metadata for UI transparency.

### 7.2 Existing Method Refactor Targets
- Report flow:
  - `PreprocessReportItemsWithAI`
  - `RefineMarkdownWithAI`
- Linear flow:
  - `generateLinearReportWithAISafe` and related helpers
- Chat flow:
  - Replace frontend direct `fetch('https://api.openai.com/v1/chat/completions')`
  - Use `ChatWithAI` backend method instead

## 8) UI/UX Design
### 8.1 Settings Page (Integrations section)
- Replace OpenAI-only form with unified AI settings block:
  - Global default provider selector
  - Provider-specific config panels (OpenAI, MiniMax, Claude CLI status)
  - Model input per provider
  - Optional base URL/mode for MiniMax
  - Chat override policy display (read-only or toggle if needed later)

### 8.2 Chat Screen
- Default model/provider follows global setting.
- Add chat-session override control:
  - Provider/model dropdown (chat only)
  - Clear indication when override is active
- No persistence required for override beyond session.

### 8.3 Report/Linear Screens
- No per-screen AI override controls.
- Show simple status text that global AI settings are used.

## 9) Migration and Backward Compatibility
1. On startup or first AI-settings read:
  - If `tool_type = ai` exists, use it.
  - Else if legacy `tool_type = openai` exists, convert/seed `tool_type = ai`.
2. Keep reading `openai` as fallback during transition window.
3. Save path writes only to `tool_type = ai` after rollout.
4. Existing behavior remains functional when migration data is absent.

## 10) Error Handling Strategy
- Settings validation:
  - Missing API key/model for selected provider -> clear actionable error.
- Provider runtime errors:
  - Normalize message shape to UI-safe format.
- Unknown MiniMax mode:
  - Return guided error: "MiniMax connection mode is not configured yet."
- Chat override invalid:
  - Fallback to global config if possible, otherwise fail with explicit reason.

## 11) Security and Data Handling
- Keep current policy: API keys are stored in local DB plaintext.
- Ensure keys are not logged in application logs.
- Keep provider request/response logs redacted for secrets.

## 12) Testing Plan
### Backend unit tests
- AI settings parse/serialize validation.
- Effective-config resolution for each feature and override scenario.
- Provider selection and fallback behavior.
- Legacy `openai` -> new `ai` migration path.

### Frontend tests
- Settings read/write for unified AI config.
- Chat override UI behavior and state transitions.
- Chat using backend API path instead of direct provider HTTP.

### Integration/regression checks
- Report preprocess still works with global provider.
- Report markdown refine still works with global provider.
- Linear report generation still works and preserves existing UX.
- Chat works with global defaults and with override.

## 13) Risks and Mitigations
- Risk: Mixed old/new config causing inconsistent behavior.
  - Mitigation: Single resolver with deterministic priority and migration.
- Risk: MiniMax contract uncertainty.
  - Mitigation: `mode/baseUrl` abstraction + provider adapter boundary.
- Risk: Temporary user confusion in settings UI.
  - Mitigation: Explicit "Global default vs Chat override" labels.

## 14) Rollout Plan
1. Add backend settings schema and resolver.
2. Introduce AI gateway and provider interface.
3. Migrate report/linear backend flows to gateway.
4. Migrate chat to backend `ChatWithAI`.
5. Update settings UI to unified AI config.
6. Run full regression for chat/report/linear.

## 15) Success Criteria
- Changing global provider/model in Settings immediately affects:
  - report preprocessing
  - report refinement
  - linear AI text generation
  - chat default provider/model
- Chat can override provider/model per session.
- Report/Linear cannot override and always use global defaults.
- No direct provider API calls remain in frontend chat implementation.
