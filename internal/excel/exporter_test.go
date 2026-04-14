package excel

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/xuri/excelize/v2"
)

func TestExportToPath_WritesReportItems(t *testing.T) {
	tempDir := t.TempDir()
	templatePath := filepath.Join(tempDir, "template.xlsx")
	outputPath := filepath.Join(tempDir, "output.xlsx")

	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	_ = f.SetCellValue(sheet, "B1", "Weekly Report")
	_ = f.SetCellValue(sheet, "C2", "prev")
	_ = f.SetCellValue(sheet, "D2", "this")
	_ = f.SetCellValue(sheet, "B3", "seed")
	if err := f.SaveAs(templatePath); err != nil {
		t.Fatalf("failed to create template: %v", err)
	}
	_ = f.Close()

	data := &ReportData{
		WeekLabel: "2026-04-14",
		WeekStart: "2026-04-13",
		WeekEnd:   "2026-04-17",
		UserName:  "tester",
		TeamName:  "team",
		Sections: []ReportSection{
			{
				Name: "project_progress",
				Type: "content",
				Items: []ReportItem{
					{
						Category: "A",
						WorkType: "si",
						ThisWeek: "done",
						NextWeek: "plan",
					},
				},
			},
		},
	}

	gotPath, err := ExportToPath(templatePath, outputPath, data)
	if err != nil {
		t.Fatalf("export failed: %v", err)
	}

	if gotPath != outputPath {
		t.Fatalf("unexpected output path: got %q want %q", gotPath, outputPath)
	}
	if _, err := os.Stat(outputPath); err != nil {
		t.Fatalf("expected output file to exist: %v", err)
	}

	out, err := excelize.OpenFile(outputPath)
	if err != nil {
		t.Fatalf("failed to open output file: %v", err)
	}
	defer out.Close()

	thisWeek, err := out.GetCellValue(sheet, "C3")
	if err != nil {
		t.Fatalf("failed to read C3: %v", err)
	}
	nextWeek, err := out.GetCellValue(sheet, "D3")
	if err != nil {
		t.Fatalf("failed to read D3: %v", err)
	}

	if thisWeek != "done" {
		t.Fatalf("unexpected C3 value: got %q want %q", thisWeek, "done")
	}
	if nextWeek != "plan" {
		t.Fatalf("unexpected D3 value: got %q want %q", nextWeek, "plan")
	}
}
