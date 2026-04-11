package utils

import (
	"fmt"
	"math"
)

// FormatMoney formats a float as currency string.
func FormatMoney(amount float64) string {
	return fmt.Sprintf("%.2f", amount)
}

// Percent calculates percentage.
func Percent(part, total float64) float64 {
	if total == 0 {
		return 0
	}
	return (part / total) * 100
}

// Round rounds a float to standard precision.
func Round(num float64) int {
	return int(num + math.Copysign(0.5, num))
}

// RoundToDecimal rounds a float to decimal precision.
func RoundToDecimal(num float64, precision int) float64 {
	output := math.Pow(10, float64(precision))
	return float64(Round(num*output)) / output
}
