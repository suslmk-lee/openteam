package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

func normalizeAICode(input string) string {
	return strings.ToLower(strings.TrimSpace(input))
}

func (d *Database) ListAIProviders(userID int64) ([]AIProvider, error) {
	rows, err := d.conn.Query(
		`SELECT id, user_id, code, display_name, enabled, created_at
		 FROM ai_providers
		 WHERE user_id = ?
		 ORDER BY display_name, code`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var providers []AIProvider
	for rows.Next() {
		var item AIProvider
		if err := rows.Scan(&item.ID, &item.UserID, &item.Code, &item.DisplayName, &item.Enabled, &item.CreatedAt); err != nil {
			return nil, err
		}
		providers = append(providers, item)
	}
	return providers, nil
}

func (d *Database) SaveAIProvider(provider *AIProvider) (int64, error) {
	code := normalizeAICode(provider.Code)
	if code == "" {
		return 0, fmt.Errorf("provider code is required")
	}
	displayName := strings.TrimSpace(provider.DisplayName)
	if displayName == "" {
		displayName = code
	}

	if provider.ID > 0 {
		_, err := d.conn.Exec(
			`UPDATE ai_providers
			 SET code = ?, display_name = ?, enabled = ?
			 WHERE id = ? AND user_id = ?`,
			code, displayName, provider.Enabled, provider.ID, provider.UserID,
		)
		if err != nil {
			return 0, err
		}
		return provider.ID, nil
	}

	res, err := d.conn.Exec(
		`INSERT INTO ai_providers (user_id, code, display_name, enabled)
		 VALUES (?, ?, ?, ?)`,
		provider.UserID, code, displayName, provider.Enabled,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) DeleteAIProvider(userID, providerID int64) error {
	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// Keep historical rows by detaching registry IDs.
	if _, err = tx.Exec(
		`UPDATE ai_usage_daily
		 SET provider_id = 0, model_id = 0, updated_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND provider_id = ?`,
		userID, providerID,
	); err != nil {
		return err
	}

	if _, err = tx.Exec(`DELETE FROM ai_billing_plans WHERE user_id = ? AND provider_id = ?`, userID, providerID); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_models WHERE user_id = ? AND provider_id = ?`, userID, providerID); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_providers WHERE user_id = ? AND id = ?`, userID, providerID); err != nil {
		return err
	}

	return tx.Commit()
}

func (d *Database) FindAIProviderByCode(userID int64, code string) (*AIProvider, error) {
	item := &AIProvider{}
	err := d.conn.QueryRow(
		`SELECT id, user_id, code, display_name, enabled, created_at
		 FROM ai_providers
		 WHERE user_id = ? AND code = ?`,
		userID, normalizeAICode(code),
	).Scan(&item.ID, &item.UserID, &item.Code, &item.DisplayName, &item.Enabled, &item.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (d *Database) ListAIModels(userID int64) ([]AIModel, error) {
	rows, err := d.conn.Query(
		`SELECT id, user_id, provider_id, model_code, display_name, enabled, created_at
		 FROM ai_models
		 WHERE user_id = ?
		 ORDER BY display_name, model_code`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var models []AIModel
	for rows.Next() {
		var item AIModel
		if err := rows.Scan(&item.ID, &item.UserID, &item.ProviderID, &item.ModelCode, &item.DisplayName, &item.Enabled, &item.CreatedAt); err != nil {
			return nil, err
		}
		models = append(models, item)
	}
	return models, nil
}

func (d *Database) SaveAIModel(model *AIModel) (int64, error) {
	modelCode := strings.TrimSpace(model.ModelCode)
	if model.ProviderID <= 0 {
		return 0, fmt.Errorf("provider id is required")
	}
	if modelCode == "" {
		return 0, fmt.Errorf("model code is required")
	}
	displayName := strings.TrimSpace(model.DisplayName)
	if displayName == "" {
		displayName = modelCode
	}

	if model.ID > 0 {
		_, err := d.conn.Exec(
			`UPDATE ai_models
			 SET provider_id = ?, model_code = ?, display_name = ?, enabled = ?
			 WHERE id = ? AND user_id = ?`,
			model.ProviderID, modelCode, displayName, model.Enabled, model.ID, model.UserID,
		)
		if err != nil {
			return 0, err
		}
		return model.ID, nil
	}

	res, err := d.conn.Exec(
		`INSERT INTO ai_models (user_id, provider_id, model_code, display_name, enabled)
		 VALUES (?, ?, ?, ?, ?)`,
		model.UserID, model.ProviderID, modelCode, displayName, model.Enabled,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) DeleteAIModel(userID, modelID int64) error {
	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(
		`UPDATE ai_usage_daily
		 SET model_id = 0, updated_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND model_id = ?`,
		userID, modelID,
	); err != nil {
		return err
	}

	if _, err = tx.Exec(`DELETE FROM ai_billing_plans WHERE user_id = ? AND model_id = ?`, userID, modelID); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_models WHERE user_id = ? AND id = ?`, userID, modelID); err != nil {
		return err
	}

	return tx.Commit()
}

func (d *Database) FindAIModelByCode(userID, providerID int64, modelCode string) (*AIModel, error) {
	item := &AIModel{}
	err := d.conn.QueryRow(
		`SELECT id, user_id, provider_id, model_code, display_name, enabled, created_at
		 FROM ai_models
		 WHERE user_id = ? AND provider_id = ? AND model_code = ?`,
		userID, providerID, strings.TrimSpace(modelCode),
	).Scan(&item.ID, &item.UserID, &item.ProviderID, &item.ModelCode, &item.DisplayName, &item.Enabled, &item.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (d *Database) ListAIBillingPlans(userID int64) ([]AIBillingPlan, error) {
	rows, err := d.conn.Query(
		`SELECT id, user_id, provider_id, model_id, monthly_fixed_usd,
		        included_input_tokens, included_output_tokens,
		        overage_input_per_1k_usd, overage_output_per_1k_usd,
		        effective_from, effective_to, created_at
		 FROM ai_billing_plans
		 WHERE user_id = ?
		 ORDER BY effective_from DESC, id DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []AIBillingPlan
	for rows.Next() {
		var plan AIBillingPlan
		var modelID sql.NullInt64
		var effectiveTo sql.NullString
		if err := rows.Scan(
			&plan.ID, &plan.UserID, &plan.ProviderID, &modelID, &plan.MonthlyFixedUSD,
			&plan.IncludedInputTokens, &plan.IncludedOutputTokens,
			&plan.OverageInputPer1kUSD, &plan.OverageOutputPer1kUSD,
			&plan.EffectiveFrom, &effectiveTo, &plan.CreatedAt,
		); err != nil {
			return nil, err
		}
		if modelID.Valid {
			value := modelID.Int64
			plan.ModelID = &value
		}
		if effectiveTo.Valid {
			value := effectiveTo.String
			plan.EffectiveTo = &value
		}
		plans = append(plans, plan)
	}
	return plans, nil
}

func (d *Database) SaveAIBillingPlan(plan *AIBillingPlan) (int64, error) {
	if plan.ProviderID <= 0 {
		return 0, fmt.Errorf("provider id is required")
	}
	if strings.TrimSpace(plan.EffectiveFrom) == "" {
		plan.EffectiveFrom = time.Now().Format("2006-01-02")
	}

	var modelID any
	if plan.ModelID != nil && *plan.ModelID > 0 {
		modelID = *plan.ModelID
	}
	var effectiveTo any
	if plan.EffectiveTo != nil && strings.TrimSpace(*plan.EffectiveTo) != "" {
		effectiveTo = strings.TrimSpace(*plan.EffectiveTo)
	}

	if plan.ID > 0 {
		_, err := d.conn.Exec(
			`UPDATE ai_billing_plans
			 SET provider_id = ?, model_id = ?, monthly_fixed_usd = ?,
			     included_input_tokens = ?, included_output_tokens = ?,
			     overage_input_per_1k_usd = ?, overage_output_per_1k_usd = ?,
			     effective_from = ?, effective_to = ?
			 WHERE id = ? AND user_id = ?`,
			plan.ProviderID, modelID, plan.MonthlyFixedUSD,
			plan.IncludedInputTokens, plan.IncludedOutputTokens,
			plan.OverageInputPer1kUSD, plan.OverageOutputPer1kUSD,
			plan.EffectiveFrom, effectiveTo,
			plan.ID, plan.UserID,
		)
		if err != nil {
			return 0, err
		}
		return plan.ID, nil
	}

	res, err := d.conn.Exec(
		`INSERT INTO ai_billing_plans (
		    user_id, provider_id, model_id, monthly_fixed_usd,
		    included_input_tokens, included_output_tokens,
		    overage_input_per_1k_usd, overage_output_per_1k_usd,
		    effective_from, effective_to
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		plan.UserID, plan.ProviderID, modelID, plan.MonthlyFixedUSD,
		plan.IncludedInputTokens, plan.IncludedOutputTokens,
		plan.OverageInputPer1kUSD, plan.OverageOutputPer1kUSD,
		plan.EffectiveFrom, effectiveTo,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) DeleteAIBillingPlan(userID, planID int64) error {
	_, err := d.conn.Exec(`DELETE FROM ai_billing_plans WHERE user_id = ? AND id = ?`, userID, planID)
	return err
}

func (d *Database) IncrementAIUsageDaily(usage *AIUsageDaily) error {
	day := strings.TrimSpace(usage.Day)
	if day == "" {
		day = time.Now().Format("2006-01-02")
	}
	feature := strings.TrimSpace(usage.Feature)
	if feature == "" {
		feature = "unknown"
	}
	rawProvider := normalizeAICode(usage.RawProvider)
	rawModel := strings.TrimSpace(usage.RawModel)

	query := `INSERT INTO ai_usage_daily (
		day, user_id, provider_id, model_id, raw_provider, raw_model, feature,
		request_count, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, payg_cost_usd
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(day, user_id, provider_id, model_id, raw_provider, raw_model, feature)
	DO UPDATE SET
		request_count = ai_usage_daily.request_count + excluded.request_count,
		input_tokens = ai_usage_daily.input_tokens + excluded.input_tokens,
		output_tokens = ai_usage_daily.output_tokens + excluded.output_tokens,
		cache_read_tokens = ai_usage_daily.cache_read_tokens + excluded.cache_read_tokens,
		cache_create_tokens = ai_usage_daily.cache_create_tokens + excluded.cache_create_tokens,
		payg_cost_usd = ai_usage_daily.payg_cost_usd + excluded.payg_cost_usd,
		updated_at = CURRENT_TIMESTAMP`

	execInsert := func(providerID, modelID any) error {
		_, err := d.conn.Exec(
			query,
			day, usage.UserID, providerID, modelID, rawProvider, rawModel, feature,
			usage.RequestCount, usage.InputTokens, usage.OutputTokens, usage.CacheReadTokens, usage.CacheCreateTokens, usage.PaygCostUSD,
		)
		return err
	}

	if err := execInsert(usage.ProviderID, usage.ModelID); err != nil {
		// Backward compatibility: some existing databases still have FK constraints
		// on ai_usage_daily.provider_id/model_id. In that schema, 0 fails FK checks.
		if usage.ProviderID <= 0 || usage.ModelID <= 0 {
			var providerID any = usage.ProviderID
			var modelID any = usage.ModelID
			if usage.ProviderID <= 0 {
				providerID = nil
			}
			if usage.ModelID <= 0 {
				modelID = nil
			}
			if retryErr := execInsert(providerID, modelID); retryErr == nil {
				return nil
			}
		}
		return err
	}
	return nil
}

func (d *Database) ListAIUsageDailyByMonth(userID int64, month string) ([]AIUsageDaily, error) {
	parsed, err := time.Parse("2006-01", strings.TrimSpace(month))
	if err != nil {
		return nil, fmt.Errorf("invalid month format: %w", err)
	}
	start := parsed.Format("2006-01-02")
	end := parsed.AddDate(0, 1, 0).Format("2006-01-02")

	rows, err := d.conn.Query(
		`SELECT day, user_id, provider_id, model_id, raw_provider, raw_model, feature,
		        request_count, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens,
		        payg_cost_usd, created_at, updated_at
		 FROM ai_usage_daily
		 WHERE user_id = ? AND day >= ? AND day < ?
		 ORDER BY day, provider_id, model_id`,
		userID, start, end,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []AIUsageDaily
	for rows.Next() {
		var item AIUsageDaily
		var providerID sql.NullInt64
		var modelID sql.NullInt64
		if err := rows.Scan(
			&item.Day, &item.UserID, &providerID, &modelID, &item.RawProvider, &item.RawModel, &item.Feature,
			&item.RequestCount, &item.InputTokens, &item.OutputTokens, &item.CacheReadTokens, &item.CacheCreateTokens,
			&item.PaygCostUSD, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if providerID.Valid {
			item.ProviderID = providerID.Int64
		}
		if modelID.Valid {
			item.ModelID = modelID.Int64
		}
		items = append(items, item)
	}
	return items, nil
}

func (d *Database) DeleteAIUsageByFeatureMonth(userID int64, month, feature string) error {
	parsed, err := time.Parse("2006-01", strings.TrimSpace(month))
	if err != nil {
		return fmt.Errorf("invalid month format: %w", err)
	}
	start := parsed.Format("2006-01-02")
	end := parsed.AddDate(0, 1, 0).Format("2006-01-02")
	_, err = d.conn.Exec(
		`DELETE FROM ai_usage_daily
		 WHERE user_id = ? AND day >= ? AND day < ? AND feature = ?`,
		userID, start, end, strings.TrimSpace(feature),
	)
	return err
}

func (d *Database) SaveAIFXRate(item *AIFXRate) error {
	if strings.TrimSpace(item.Day) == "" {
		return fmt.Errorf("fx day is required")
	}
	if strings.TrimSpace(item.Base) == "" || strings.TrimSpace(item.Quote) == "" {
		return fmt.Errorf("fx currency pair is required")
	}
	_, err := d.conn.Exec(
		`INSERT INTO ai_fx_rates (day, base, quote, rate, source)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(day, base, quote)
		 DO UPDATE SET rate = excluded.rate, source = excluded.source, fetched_at = CURRENT_TIMESTAMP`,
		item.Day, strings.ToUpper(item.Base), strings.ToUpper(item.Quote), item.Rate, strings.TrimSpace(item.Source),
	)
	return err
}

func (d *Database) GetAIFXRate(day, base, quote string) (*AIFXRate, error) {
	rate := &AIFXRate{}
	err := d.conn.QueryRow(
		`SELECT day, base, quote, rate, source, fetched_at
		 FROM ai_fx_rates
		 WHERE day = ? AND base = ? AND quote = ?`,
		day, strings.ToUpper(base), strings.ToUpper(quote),
	).Scan(&rate.Day, &rate.Base, &rate.Quote, &rate.Rate, &rate.Source, &rate.FetchedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return rate, nil
}

func (d *Database) GetLatestAIFXRate(base, quote string) (*AIFXRate, error) {
	rate := &AIFXRate{}
	err := d.conn.QueryRow(
		`SELECT day, base, quote, rate, source, fetched_at
		 FROM ai_fx_rates
		 WHERE base = ? AND quote = ?
		 ORDER BY day DESC
		 LIMIT 1`,
		strings.ToUpper(base), strings.ToUpper(quote),
	).Scan(&rate.Day, &rate.Base, &rate.Quote, &rate.Rate, &rate.Source, &rate.FetchedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return rate, nil
}
