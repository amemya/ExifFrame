package main

import (
	_ "embed"
	"encoding/json"
)

//go:embed data/recipes.json
var recipesJSON []byte

// Recipe represents a film development recipe
type Recipe struct {
	Film      string `json:"film"`
	Developer string `json:"developer"`
	Dilution  string `json:"dilution"`
	Temp      string `json:"temp"`
	Time      string `json:"time"`
}

var allRecipes []Recipe

func init() {
	if err := json.Unmarshal(recipesJSON, &allRecipes); err != nil {
		panic("Failed to parse bundled recipes.json: " + err.Error())
	}
}

// GetFilmRecipes returns all loaded recipes.
func GetFilmRecipes() []Recipe {
	result := make([]Recipe, len(allRecipes))
	copy(result, allRecipes)
	return result
}
