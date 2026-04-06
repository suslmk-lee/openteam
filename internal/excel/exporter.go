package excel

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type ReportData struct {
	WeekLabel string          `json:"weekLabel"`
	WeekStart string          `json:"weekStart"`
	WeekEnd   string          `json:"weekEnd"`
	UserName  string          `json:"userName"`
	TeamName  string          `json:"teamName"`
	Sections  []ReportSection `json:"sections"`
	// Utilization data for 가동율 sheet
	Members   []UtilizationMemberData `json:"members,omitempty"`
}

type ReportSection struct {
	Name  string       `json:"name"`
	Type  string       `json:"type"`
	Items []ReportItem `json:"items"`
}

type ReportItem struct {
	Category string `json:"category"`
	WorkType string `json:"workType"`
	ThisWeek string `json:"thisWeek"`
	NextWeek string `json:"nextWeek"`
	Note     string `json:"note"`
}

// templateLayout describes the discovered structure of the 주간업무 sheet
type templateLayout struct {
	sheetName    string
	titleRow     int // row with the week title (usually 1)
	headerRow    int // row with column headers (usually 2)
	contentStart int // first content row (usually 3)
	contentEnd   int // last content row
	colPrevWeek  int // column for 전주 실적 (usually C=3)
	colThisWeek  int // column for 금주 계획 (usually D=4)
	colNote      int // column for 비고 (usually E=5)
	sectionRows  []int // rows that are section headers (contain [xxx] markers)
	smHeaderRow  int
	siHeaderRow  int
}

func ExportWeeklyReport(templatePath, outputDir string, data *ReportData) (string, error) {
	timestamp := time.Now().Format("20060102_150405")
	outputName := fmt.Sprintf("주간업무일지_%s_%s.xlsx", data.WeekLabel, timestamp)
	outputPath := filepath.Join(outputDir, outputName)
	return ExportToPath(templatePath, outputPath, data)
}

func ExportToPath(templatePath, outputPath string, data *ReportData) (string, error) {
	f, err := excelize.OpenFile(templatePath)
	if err != nil {
		return "", fmt.Errorf("failed to open template: %w", err)
	}
	defer f.Close()

	layout, err := discoverLayout(f)
	if err != nil {
		return "", fmt.Errorf("failed to analyze template: %w", err)
	}

	log.Printf("[excel] Layout: sheet=%s, title=R%d, header=R%d, content=R%d~R%d, prevCol=%d, thisCol=%d, noteCol=%d, sectionRows=%v, smHeader=R%d, siHeader=R%d",
		layout.sheetName, layout.titleRow, layout.headerRow,
		layout.contentStart, layout.contentEnd,
		layout.colPrevWeek, layout.colThisWeek, layout.colNote, layout.sectionRows, layout.smHeaderRow, layout.siHeaderRow)

	// Analyze 가동률 sheet if present
	utilLayout, err := analyzeUtilizationSheet(f)
	if err != nil {
		log.Printf("[excel] 가동률 sheet not found or error: %v", err)
	}

	// Step 1.5: Populate 가동률 sheet with team member data if available
	if utilLayout != nil && len(data.Members) > 0 {
		// Parse current month from WeekStart
		currentMonth := time.Now().Month()
		if data.WeekStart != "" {
			ws, err := time.Parse(time.RFC3339, data.WeekStart)
			if err != nil {
				ws, _ = time.Parse("2006-01-02", data.WeekStart)
			}
			if !ws.IsZero() {
				currentMonth = ws.Month()
			}
		}

		if err := PopulateUtilizationSheet(f, utilLayout, data.Members, int(currentMonth)); err != nil {
			log.Printf("[excel] Error populating utilization sheet: %v", err)
		}
	}

	// Step 1: Update title row with new week info
	updateTitle(f, layout, data)

	// Step 2: Shift columns — move "금주 계획" → "전주 실적", then write new "금주 계획"
	shiftAndWriteContent(f, layout, data)

	// Step 3: Save
	outputDir := filepath.Dir(outputPath)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output dir: %w", err)
	}

	if err := f.SaveAs(outputPath); err != nil {
		return "", fmt.Errorf("failed to save report: %w", err)
	}

	// Verify written content
	verifyCell, _ := excelize.CoordinatesToCellName(layout.colThisWeek, 5)
	verifyVal, _ := f.GetCellValue(layout.sheetName, verifyCell)
	log.Printf("[excel] Verification - cell %s value: %.30s...", verifyCell, verifyVal)

	// Check cell style
	styleIdx, _ := f.GetCellStyle(layout.sheetName, verifyCell)
	log.Printf("[excel] Cell %s style index: %d", verifyCell, styleIdx)

	log.Printf("[excel] Export completed successfully: %s", outputPath)
	return outputPath, nil
}

// discoverLayout analyzes the template to find the structure
func discoverLayout(f *excelize.File) (*templateLayout, error) {
	sheetName := "주간업무"
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("no sheets found")
	}

	found := false
	for _, s := range sheets {
		if s == sheetName {
			found = true
			break
		}
	}
	if !found {
		sheetName = sheets[0]
	}

	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, err
	}

	layout := &templateLayout{
		sheetName:    sheetName,
		titleRow:     1,
		headerRow:    2,
		contentStart: 3,
		contentEnd:   len(rows),
		colPrevWeek:  3, // C
		colThisWeek:  4, // D
		colNote:      5, // E
	}

	// Find header row by looking for "구분" or "전주" or "금주"
	for i, row := range rows {
		rowNum := i + 1
		rowText := strings.Join(row, " ")
		if strings.Contains(rowText, "전주") && strings.Contains(rowText, "금주") {
			layout.headerRow = rowNum
			layout.contentStart = rowNum + 1

			// Detect which columns are 전주/금주
			for j, cell := range row {
				colNum := j + 1
				if strings.Contains(cell, "전주") {
					layout.colPrevWeek = colNum
				}
				if strings.Contains(cell, "금주") {
					layout.colThisWeek = colNum
				}
				if strings.Contains(cell, "비고") {
					layout.colNote = colNum
				}
			}
			break
		}
	}

	// Title row is before header
	layout.titleRow = layout.headerRow - 1
	if layout.titleRow < 1 {
		layout.titleRow = 1
	}

	// Find section header rows (rows with [xxx] markers)
	for i := layout.contentStart - 1; i < len(rows); i++ {
		rowNum := i + 1
		row := rows[i]
		for _, cell := range row {
			trimmed := strings.TrimSpace(cell)
			if strings.Contains(trimmed, "기본업무") && strings.Contains(strings.ToUpper(trimmed), "SM") {
				layout.smHeaderRow = rowNum
			}
			if strings.Contains(trimmed, "주요업무") && strings.Contains(strings.ToUpper(trimmed), "SI") {
				layout.siHeaderRow = rowNum
			}

			if strings.Contains(cell, "[") && strings.Contains(cell, "]") {
				layout.sectionRows = append(layout.sectionRows, rowNum)
				break
			}
			if strings.HasPrefix(strings.TrimSpace(cell), "●") {
				layout.sectionRows = append(layout.sectionRows, rowNum)
				break
			}
		}
	}

	return layout, nil
}

// utilizationLayout describes the structure of the 가동률 sheet
type utilizationLayout struct {
	sheetName    string
	summaryRows  int    // R1-R6: 요약 영역
	sectionRow   int    // R7: 섹션 제목
	headerRow    int    // R8: 헤더
	dataStart    int    // R9: 데이터 시작
	dataEnd      int    // R38: 데이터 끝
	// Column positions (1-indexed)
	nameCol      int    // C2: 이름
	teamCol      int    // C3: 팀
	joinMonthCol int    // C4: 입사월
	leaveMonthCol int   // C5: 퇴사월
	cumulRateCol int    // C6: 누계 가동률
	monthRateCol int    // C7: 당월 가동률
	monthTotalCol int   // C8: 월 누계
	janCol       int    // C9: 1월
	febCol       int    // C10: 2월
	marCol       int    // C11: 3월
	aprCol       int    // C12: 4월
	mayCol       int    // C13: 5월
	junCol       int    // C14: 6월
	julCol       int    // C15: 7월
	augCol       int    // C16: 8월
	sepCol       int    // C17: 9월
	octCol       int    // C18: 10월
	novCol       int    // C19: 11월
	decCol       int    // C20: 12월
	totalCol     int    // C21: 총 합계
	expRateCol   int    // C22: 전체 예상가동률
	noteCol      int    // C23: 비고
	appMonthCol  int    // C25: 적용월(누)
	appTotalCol  int    // C26: 적용전체
}

// analyzeUtilizationSheet analyzes the 가동률/가동율 sheet structure
func analyzeUtilizationSheet(f *excelize.File) (*utilizationLayout, error) {
	sheetName := ""
	sheets := f.GetSheetList()
	
	// Find sheet with "가동률" or "가동율" in the name
	for _, s := range sheets {
		if strings.Contains(s, "가동률") || strings.Contains(s, "가동율") {
			sheetName = s
			break
		}
	}
	
	if sheetName == "" {
		return nil, fmt.Errorf("no 가동률 sheet found")
	}
	
	// Based on template analysis, use fixed column positions
	layout := &utilizationLayout{
		sheetName:     sheetName,
		summaryRows:   6,   // R1-R6
		sectionRow:    7,   // R7
		headerRow:     8,   // R8
		dataStart:     9,   // R9
		dataEnd:       38,  // R38
		// Fixed column positions based on template analysis
		nameCol:       2,   // C2
		teamCol:       3,   // C3
		joinMonthCol:  4,   // C4
		leaveMonthCol: 5,   // C5
		cumulRateCol:  6,   // C6
		monthRateCol:  7,   // C7
		monthTotalCol: 8,   // C8
		janCol:        9,   // C9
		febCol:        10,  // C10
		marCol:        11,  // C11
		aprCol:        12,  // C12
		mayCol:        13,  // C13
		junCol:        14,  // C14
		julCol:        15,  // C15
		augCol:        16,  // C16
		sepCol:        17,  // C17
		octCol:        18,  // C18
		novCol:        19,  // C19
		decCol:        20,  // C20
		totalCol:      21,  // C21
		expRateCol:    22,  // C22
		noteCol:       23,  // C23
		appMonthCol:   25,  // C25
		appTotalCol:   26,  // C26
	}
	
	log.Printf("[excel] 가동률 layout fixed: sheet=%s, summary=R1-R%d, header=R%d, data=R%d-R%d", 
		layout.sheetName, layout.summaryRows, layout.headerRow, layout.dataStart, layout.dataEnd)
	log.Printf("[excel] 가동률 columns: name=C%d, team=C%d, note=C%d, appMonth=C%d", 
		layout.nameCol, layout.teamCol, layout.noteCol, layout.appMonthCol)
	
	return layout, nil
}
// matching the backend calcWeekLabel logic.
func calcExcelWeekLabel(monday time.Time) (int, int, int) {
	wednesday := monday.AddDate(0, 0, 2)
	return wednesday.Year(), int(wednesday.Month()), (wednesday.Day()-1)/7 + 1
}

// updateTitle updates the title row with new week info
func updateTitle(f *excelize.File, layout *templateLayout, data *ReportData) {
	// Read current title
	titleCell, _ := excelize.CoordinatesToCellName(2, layout.titleRow)
	currentTitle, _ := f.GetCellValue(layout.sheetName, titleCell)

	log.Printf("[excel] updateTitle: currentTitle=%q, data.WeekStart=%q, data.WeekEnd=%q", currentTitle, data.WeekStart, data.WeekEnd)

	if currentTitle != "" && data.WeekStart != "" {
		// Parse date - handle both "2006-01-02" and "2006-01-02T00:00:00Z" formats
		ws, err := time.Parse(time.RFC3339, data.WeekStart)
		if err != nil {
			// Try simple date format
			ws, err = time.Parse("2006-01-02", data.WeekStart)
			if err != nil {
				log.Printf("[excel] Failed to parse WeekStart %q: %v", data.WeekStart, err)
				return
			}
		}
		we, _ := time.Parse(time.RFC3339, data.WeekEnd)
		if we.IsZero() {
			we, _ = time.Parse("2006-01-02", data.WeekEnd)
		}
		
		year, month, weekNum := calcExcelWeekLabel(ws)
		weekday := []string{"일", "월", "화", "수", "목", "금", "토"}

		weekLabel := fmt.Sprintf("%d월 %d주", month, weekNum)
		dateLabel := fmt.Sprintf("%d/%d(%s)", int(ws.Month()), ws.Day(), weekday[ws.Weekday()])

		log.Printf("[excel] Calculated: year=%d, month=%d, weekNum=%d, weekLabel=%q, dateLabel=%q", year, month, weekNum, weekLabel, dateLabel)

		// Replace year/month/week pattern
		parts := strings.Split(currentTitle, ")")
		if len(parts) >= 2 {
			for i, part := range parts {
				if strings.Contains(part, "년") && strings.Contains(part, "월") {
					idx := strings.LastIndex(part, "(")
					if idx >= 0 {
						parts[i] = part[:idx] + fmt.Sprintf("(%d년 %s", year, weekLabel)
					}
				}
			}
			newTitle := strings.Join(parts[:len(parts)-1], ")") + ") " + dateLabel

			// Update header row dates
			headerPrev, _ := excelize.CoordinatesToCellName(layout.colPrevWeek, layout.headerRow)
			headerThis, _ := excelize.CoordinatesToCellName(layout.colThisWeek, layout.headerRow)

			prevMonday := ws.AddDate(0, 0, -7)
			prevFriday := prevMonday.AddDate(0, 0, 4)
			prevLabel := fmt.Sprintf("전주 실적 (%d/%d ~ %d/%d)",
				int(prevMonday.Month()), prevMonday.Day(), int(prevFriday.Month()), prevFriday.Day())
			thisLabel := fmt.Sprintf("금주 계획 (%d/%d ~ %d/%d)",
				int(ws.Month()), ws.Day(), int(we.Month()), we.Day())

			f.SetCellValue(layout.sheetName, headerPrev, prevLabel)
			f.SetCellValue(layout.sheetName, headerThis, thisLabel)

			log.Printf("[excel] Title updating: %q -> %q", currentTitle, newTitle)
			log.Printf("[excel] Header updating: prev=%q, this=%q", prevLabel, thisLabel)
			
			if err := f.SetCellValue(layout.sheetName, titleCell, newTitle); err != nil {
				log.Printf("[excel] Error setting title: %v", err)
			}
		} else {
			log.Printf("[excel] Could not parse title format (expected ')' separator)")
		}
	} else {
		log.Printf("[excel] Skipping title update: currentTitle empty=%v, WeekStart empty=%v", currentTitle == "", data.WeekStart == "")
	}
}

// shiftAndWriteContent writes new items into 금주 column without shifting from template
func shiftAndWriteContent(f *excelize.File, layout *templateLayout, data *ReportData) {
	sn := layout.sheetName

	// Build a set of section header rows for quick lookup
	sectionRowSet := make(map[int]bool)
	for _, r := range layout.sectionRows {
		sectionRowSet[r] = true
	}

	// Step 1: Clear all content rows (both 전주 and 금주 columns) to start fresh
	for row := layout.contentStart; row <= layout.contentEnd; row++ {
		if sectionRowSet[row] {
			continue // Skip section headers
		}
		prevCell, _ := excelize.CoordinatesToCellName(layout.colPrevWeek, row)
		thisCell, _ := excelize.CoordinatesToCellName(layout.colThisWeek, row)
		f.SetCellValue(sn, prevCell, "")  // Clear 전주
		f.SetCellValue(sn, thisCell, "") // Clear 금주
	}

	// Step 2: Collect all items and split by work type (SM/SI)
	allItems := []ReportItem{}
	for _, section := range data.Sections {
		allItems = append(allItems, section.Items...)
	}
	log.Printf("[excel] Total items to write: %d from %d sections", len(allItems), len(data.Sections))

	smItems := []ReportItem{}
	siItems := []ReportItem{}
	for _, item := range allItems {
		log.Printf("[excel] Item: Category=%s, WorkType=%s, ThisWeek=%.20s...", item.Category, item.WorkType, item.ThisWeek)
		if strings.EqualFold(strings.TrimSpace(item.WorkType), "sm") {
			smItems = append(smItems, item)
		} else {
			siItems = append(siItems, item)
		}
	}
	log.Printf("[excel] SM items: %d, SI items: %d", len(smItems), len(siItems))

	// Build writable row pools
	allWritableRows := collectWritableRows(layout.contentStart, layout.contentEnd, sectionRowSet)
	smWritableRows := []int{}
	siWritableRows := []int{}

	if layout.smHeaderRow > 0 && layout.siHeaderRow > 0 && layout.siHeaderRow > layout.smHeaderRow {
		smWritableRows = collectWritableRows(layout.smHeaderRow+1, layout.siHeaderRow-1, sectionRowSet)
		siWritableRows = collectWritableRows(layout.siHeaderRow+1, layout.contentEnd, sectionRowSet)
	}

	if len(smWritableRows) == 0 || len(siWritableRows) == 0 {
		log.Printf("[excel] SM/SI ranges not detected, falling back to global writable rows")
		writeItemsToRows(f, sn, layout, allItems, allWritableRows)
		return
	}

	log.Printf("[excel] Writing items by work type: SM=%d rows=%d, SI=%d rows=%d",
		len(smItems), len(smWritableRows), len(siItems), len(siWritableRows))

	writeItemsToRows(f, sn, layout, smItems, smWritableRows)
	writeItemsToRows(f, sn, layout, siItems, siWritableRows)
}

func collectWritableRows(start, end int, sectionRowSet map[int]bool) []int {
	rows := []int{}
	for row := start; row <= end; row++ {
		if !sectionRowSet[row] {
			rows = append(rows, row)
		}
	}
	return rows
}

func writeItemsToRows(f *excelize.File, sheetName string, layout *templateLayout, items []ReportItem, rows []int) {
	log.Printf("[excel] writeItemsToRows: writing %d items to %d rows (sheet=%s)", len(items), len(rows), sheetName)
	for i, item := range items {
		if i >= len(rows) {
			log.Printf("[excel] Warning: more items (%d) than writable rows (%d), some items skipped", len(items), len(rows))
			break
		}
		row := rows[i]

		thisCell, _ := excelize.CoordinatesToCellName(layout.colThisWeek, row)
		content := item.ThisWeek
		if content == "" {
			content = item.Category
		}
		log.Printf("[excel] Writing item %d to row %d, cell %s: %.30s...", i, row, thisCell, content)
		err := f.SetCellValue(sheetName, thisCell, content)
		if err != nil {
			log.Printf("[excel] Error writing to cell %s: %v", thisCell, err)
		}

		// Write NextWeek or Note to 비고 column
		noteContent := item.Note
		if item.NextWeek != "" {
			if noteContent != "" {
				noteContent = "[차주] " + item.NextWeek + " / " + noteContent
			} else {
				noteContent = "[차주] " + item.NextWeek
			}
		}
		if noteContent != "" {
			noteCell, _ := excelize.CoordinatesToCellName(layout.colNote, row)
			err := f.SetCellValue(sheetName, noteCell, noteContent)
			if err != nil {
				log.Printf("[excel] Error writing note to cell %s: %v", noteCell, err)
			}
		}
	}
}

// UtilizationMemberData represents a team member's utilization data
type UtilizationMemberData struct {
	Name        string
	Team        string
	JoinMonth   int
	LeaveMonth  int
	Projects    []string
	MonthlyMM   [12]float64 // M/M per month (Jan-Dec)
	Note        string
}

// PopulateUtilizationSheet fills the utilization sheet with team member data
func PopulateUtilizationSheet(f *excelize.File, layout *utilizationLayout, members []UtilizationMemberData, currentMonth int) error {
	if layout == nil {
		return fmt.Errorf("utilization layout is nil")
	}

	sn := layout.sheetName

	// Clear existing data rows (R9 to R38)
	for row := layout.dataStart; row <= layout.dataEnd; row++ {
		for col := layout.nameCol; col <= layout.appTotalCol; col++ {
			cell, _ := excelize.CoordinatesToCellName(col, row)
			f.SetCellValue(sn, cell, "")
		}
	}

	// Write member data starting from dataStart (R9)
	// Only fill (member count + 2) rows as requested
	maxDataRows := len(members) + 2
	row := layout.dataStart
	dataEndRow := layout.dataStart + maxDataRows - 1
	if dataEndRow > layout.dataEnd {
		dataEndRow = layout.dataEnd
	}
	
	log.Printf("[excel] Filling utilization data: members=%d, maxRows=%d, range=R%d-R%d", 
		len(members), maxDataRows, layout.dataStart, dataEndRow)
	
	for _, member := range members {
		if row > dataEndRow {
			log.Printf("[excel] Warning: more members (%d) than allocated rows (%d), some skipped", len(members), maxDataRows)
			break
		}

		// Calculate totals
		totalMM := 0.0
		for _, mm := range member.MonthlyMM {
			totalMM += mm
		}

		// Calculate current month rate (current month MM / current month)
		monthRate := 0.0
		if currentMonth >= 1 && currentMonth <= 12 {
			monthRate = member.MonthlyMM[currentMonth-1] * 100 // Convert to percentage
		}

		// Calculate cumulative rate (total MM / current month)
		cumulRate := (totalMM / float64(currentMonth)) * 100
		if cumulRate > 100 {
			cumulRate = 100
		}

		// Write member data
		f.SetCellValue(sn, mustCell(layout.nameCol, row), member.Name)
		f.SetCellValue(sn, mustCell(layout.teamCol, row), member.Team)
		if member.JoinMonth > 0 {
			f.SetCellValue(sn, mustCell(layout.joinMonthCol, row), member.JoinMonth)
		}
		if member.LeaveMonth > 0 {
			f.SetCellValue(sn, mustCell(layout.leaveMonthCol, row), member.LeaveMonth)
		}
		f.SetCellValue(sn, mustCell(layout.cumulRateCol, row), fmt.Sprintf("%.2f%%", cumulRate))
		f.SetCellValue(sn, mustCell(layout.monthRateCol, row), fmt.Sprintf("%.2f%%", monthRate))
		f.SetCellValue(sn, mustCell(layout.monthTotalCol, row), member.MonthlyMM[currentMonth-1])

		// Write monthly M/M data
		f.SetCellValue(sn, mustCell(layout.janCol, row), member.MonthlyMM[0])
		f.SetCellValue(sn, mustCell(layout.febCol, row), member.MonthlyMM[1])
		f.SetCellValue(sn, mustCell(layout.marCol, row), member.MonthlyMM[2])
		f.SetCellValue(sn, mustCell(layout.aprCol, row), member.MonthlyMM[3])
		f.SetCellValue(sn, mustCell(layout.mayCol, row), member.MonthlyMM[4])
		f.SetCellValue(sn, mustCell(layout.junCol, row), member.MonthlyMM[5])
		f.SetCellValue(sn, mustCell(layout.julCol, row), member.MonthlyMM[6])
		f.SetCellValue(sn, mustCell(layout.augCol, row), member.MonthlyMM[7])
		f.SetCellValue(sn, mustCell(layout.sepCol, row), member.MonthlyMM[8])
		f.SetCellValue(sn, mustCell(layout.octCol, row), member.MonthlyMM[9])
		f.SetCellValue(sn, mustCell(layout.novCol, row), member.MonthlyMM[10])
		f.SetCellValue(sn, mustCell(layout.decCol, row), member.MonthlyMM[11])

		f.SetCellValue(sn, mustCell(layout.totalCol, row), totalMM)

		// Expected rate (total / 12 months)
		expRate := (totalMM / 12.0) * 100
		if expRate > 100 {
			expRate = 100
		}
		f.SetCellValue(sn, mustCell(layout.expRateCol, row), fmt.Sprintf("%.2f%%", expRate))

		if member.Note != "" {
			f.SetCellValue(sn, mustCell(layout.noteCol, row), member.Note)
		}

		// Applied months (current month and total)
		f.SetCellValue(sn, mustCell(layout.appMonthCol, row), currentMonth)
		f.SetCellValue(sn, mustCell(layout.appTotalCol, row), 12)

		row++
	}

	// Update summary area
	log.Printf("[excel] Updating summary area: currentMonth=%d, memberCount=%d", currentMonth, len(members))
	
	// Calculate team statistics
	var totalMM, currentMonthMM float64
	for _, member := range members {
		for i, mm := range member.MonthlyMM {
			totalMM += mm
			if i < currentMonth {
				currentMonthMM += mm
			}
		}
	}
	
	// Average M/M per member for current month
	avgMM := 0.0
	if len(members) > 0 {
		avgMM = currentMonthMM / float64(len(members))
	}
	
	// 당월 가동률 (current month utilization rate)
	monthRate := avgMM * 100 // Already stored as ratio, convert to percentage
	if monthRate > 100 {
		monthRate = 100
	}
	
	// 누계 가동률 (cumulative rate)
	cumulRate := 0.0
	if len(members) > 0 && currentMonth > 0 {
		cumulRate = (totalMM / float64(len(members)) / float64(currentMonth)) * 100
		if cumulRate > 100 {
			cumulRate = 100
		}
	}
	
	// 연간 예상가동률 (expected annual rate)
	expRate := 0.0
	if len(members) > 0 {
		expRate = (totalMM / float64(len(members)) / 12.0) * 100
		if expRate > 100 {
			expRate = 100
		}
	}
	
	// R3: 당월 가동률 (H3=SI사업팀, I3=EIS사업부, O3=내부프로젝트, Q3=전체)
	f.SetCellValue(sn, mustCell(8, 3), fmt.Sprintf("%.2f%%", monthRate))  // H3: SI사업팀
	f.SetCellValue(sn, mustCell(9, 3), fmt.Sprintf("%.2f%%", monthRate))  // I3: EIS사업부 (same for now)
	f.SetCellValue(sn, mustCell(15, 3), "100.00%")                       // O3: 내부프로젝트
	f.SetCellValue(sn, mustCell(17, 3), fmt.Sprintf("%.2f%%", monthRate))  // Q3: 전체
	log.Printf("[excel] Set R3 당월가동률: SI=%.2f%%, 전체=%.2f%%", monthRate, monthRate)
	
	// R4: 적용인원 & 누계 가동률
	memberCountCellR4, _ := excelize.CoordinatesToCellName(3, 4)
	f.SetCellValue(sn, memberCountCellR4, fmt.Sprintf("%d명", len(members)))
	
	f.SetCellValue(sn, mustCell(8, 4), fmt.Sprintf("%.2f%%", cumulRate))  // H4: SI사업팀 누계
	f.SetCellValue(sn, mustCell(9, 4), fmt.Sprintf("%.2f%%", cumulRate))  // I4: EIS사업부 누계
	f.SetCellValue(sn, mustCell(15, 4), "100.00%")                       // O4: 내부프로젝트 누계
	f.SetCellValue(sn, mustCell(17, 4), fmt.Sprintf("%.2f%%", cumulRate)) // Q4: 전체 누계
	log.Printf("[excel] Set R4 누계가동률: %.2f%%", cumulRate)
	
	// R5: 적용월 & 연간 예상가동률
	appMonthCell, _ := excelize.CoordinatesToCellName(3, 5)
	f.SetCellValue(sn, appMonthCell, fmt.Sprintf("%d월", currentMonth))
	
	f.SetCellValue(sn, mustCell(8, 5), fmt.Sprintf("%.2f%%", expRate))   // H5: SI사업팀 예상
	f.SetCellValue(sn, mustCell(9, 5), fmt.Sprintf("%.2f%%", expRate))   // I5: EIS사업부 예상
	f.SetCellValue(sn, mustCell(15, 5), "0.00%")                        // O5: 내부프로젝트 예상
	f.SetCellValue(sn, mustCell(17, 5), fmt.Sprintf("%.2f%%", expRate))  // Q5: 전체 예상
	log.Printf("[excel] Set R5 예상가동률: %.2f%%", expRate)

	// R6: 인원수 (H6: SI사업팀, I6: EIS사업부, O6: 내부프로젝트, Q6: 전체)
	f.SetCellValue(sn, mustCell(8, 6), len(members))   // H6: SI사업팀
	f.SetCellValue(sn, mustCell(9, 6), len(members))   // I6: EIS사업부 (same)
	f.SetCellValue(sn, mustCell(11, 6), 0)             // K6: 
	f.SetCellValue(sn, mustCell(13, 6), 0)             // M6: 
	f.SetCellValue(sn, mustCell(15, 6), 0)             // O6: 내부프로젝트
	f.SetCellValue(sn, mustCell(17, 6), len(members))  // Q6: 전체
	log.Printf("[excel] Set R6 인원수: %d", len(members))

	// R7: [인원현황 및 가동률] 섹션 제목 업데이트
	// Calculate total M/M for section title
	sectionTotalMM := 0.0
	for _, member := range members {
		for _, mm := range member.MonthlyMM {
			sectionTotalMM += mm
		}
	}
	sectionTitle := fmt.Sprintf("[인원현황 및 가동률] : 총인원 %d 명, %d 월말 현재 %.2fM/M 투입, 누계가동률 %.2f%%",
		len(members), currentMonth, sectionTotalMM, cumulRate)
	f.SetCellValue(sn, mustCell(2, 7), sectionTitle)  // C2
	log.Printf("[excel] Set R7 섹션제목: %s", sectionTitle)

	log.Printf("[excel] Populated utilization sheet with %d members", len(members))
	return nil
}

// mustCell creates a cell reference from column and row numbers
func mustCell(col, row int) string {
	cell, _ := excelize.CoordinatesToCellName(col, row)
	return cell
}

func CopyTemplate(templatePath, outputDir, weekLabel string) (string, error) {
	f, err := excelize.OpenFile(templatePath)
	if err != nil {
		return "", fmt.Errorf("failed to open template: %w", err)
	}
	defer f.Close()

	timestamp := time.Now().Format("20060102_150405")
	outputName := fmt.Sprintf("주간업무일지_%s_%s.xlsx", weekLabel, timestamp)
	outputPath := filepath.Join(outputDir, outputName)

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output dir: %w", err)
	}

	if err := f.SaveAs(outputPath); err != nil {
		return "", fmt.Errorf("failed to save copy: %w", err)
	}

	return outputPath, nil
}
