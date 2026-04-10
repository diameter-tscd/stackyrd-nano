package main

import (
	"embed"
)

//go:embed config.yaml banner.txt
var embeddedFiles embed.FS
