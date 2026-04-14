param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = "Stop"

go run github.com/wailsapp/wails/v2/cmd/wails@v2.12.0 @Args
