// go-service/main.go
package main

import (
	"encoding/json"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/hello", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Request: %s %s", r.Method, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Hello from Go!",
		})
	})

	log.Println("Listening on :3000")
	log.Fatal(http.ListenAndServe(":3000", nil))
}
