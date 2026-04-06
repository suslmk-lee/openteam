package excel

import (
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/xuri/excelize/v2"
)

type SheetStructure struct {
	Name       string          `json:"name"`
	MaxRow     int             `json:"maxRow"`
	MaxCol     int             `json:"maxCol"`
	MergedCells []MergedCell   `json:"mergedCells"`
	Sections   []Section       `json:"sections"`
}

type MergedCell struct {
	StartCell string `json:"startCell"`
	EndCell   string `json:"endCell"`
	Value     string `json:"value"`
}

type Section struct {
	Name      string `json:"name"`
	StartRow  int    `json:"startRow"`
	EndRow    int    `json:"endRow"`
	Type      string `json:"type"`
}

type TemplateStructure struct {
	FileName string           `json:"fileName"`
	Sheets   []SheetStructure `json:"sheets"`
}

type CellInfo struct {
	Row    int    `json:"row"`
	Col    int    `json:"col"`
	Value  string `json:"value"`
	Formula string `json:"formula"`
}

func ParseTemplate(filePath string) (*TemplateStructure, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open excel file: %w", err)
	}
	defer f.Close()

	ts := &TemplateStructure{
		FileName: filepath.Base(filePath),
	}

	for _, sheetName := range f.GetSheetList() {
		ss := SheetStructure{
			Name: sheetName,
		}

		rows, err := f.GetRows(sheetName)
		if err != nil {
			return nil, fmt.Errorf("failed to get rows for sheet %s: %w", sheetName, err)
		}
		ss.MaxRow = len(rows)
		for _, row := range rows {
			if len(row) > ss.MaxCol {
				ss.MaxCol = len(row)
			}
		}

		merged, err := f.GetMergeCells(sheetName)
		if err == nil {
			for _, mc := range merged {
				ss.MergedCells = append(ss.MergedCells, MergedCell{
					StartCell: mc.GetStartAxis(),
					EndCell:   mc.GetEndAxis(),
					Value:     mc.GetCellValue(),
				})
			}
		}

		ss.Sections = detectSections(f, sheetName, rows)
		ts.Sheets = append(ts.Sheets, ss)
	}

	return ts, nil
}

func detectSections(f *excelize.File, sheetName string, rows [][]string) []Section {
	var sections []Section

	if sheetName == "주간업무" {
		currentSection := ""
		sectionStart := 0

		for i, row := range rows {
			rowNum := i + 1
			cellText := ""
			if len(row) > 1 {
				cellText = row[1]
			} else if len(row) > 0 {
				cellText = row[0]
			}

			if cellText == "" {
				continue
			}

			if containsAny(cellText, []string{"[프로젝트", "[사업", "[기타"}) || 
			   containsAny(cellText, []string{"프로젝트 진행", "사업개발", "기타 : 근태"}) {
				if currentSection != "" && sectionStart > 0 {
					sections = append(sections, Section{
						Name:     currentSection,
						StartRow: sectionStart,
						EndRow:   rowNum - 1,
						Type:     "content",
					})
				}
				currentSection = cellText
				sectionStart = rowNum
			}
		}

		if currentSection != "" && sectionStart > 0 {
			sections = append(sections, Section{
				Name:     currentSection,
				StartRow: sectionStart,
				EndRow:   len(rows),
				Type:     "content",
			})
		}
	}

	return sections
}

func containsAny(s string, substrs []string) bool {
	for _, sub := range substrs {
		if len(s) >= len(sub) {
			for i := 0; i <= len(s)-len(sub); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
		}
	}
	return false
}

func StructureToJSON(ts *TemplateStructure) (string, error) {
	data, err := json.Marshal(ts)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func JSONToStructure(jsonStr string) (*TemplateStructure, error) {
	var ts TemplateStructure
	if err := json.Unmarshal([]byte(jsonStr), &ts); err != nil {
		return nil, err
	}
	return &ts, nil
}
