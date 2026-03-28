package main

import (
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/valyala/fasthttp"
)

func main() {
	// Use all available CPU cores
	runtime.GOMAXPROCS(runtime.NumCPU())

	server := &fasthttp.Server{
		Handler: func(ctx *fasthttp.RequestCtx) {
			ctx.Response.SetBody([]byte("pong"))
		},
		// Tune server parameters
		Name:                          "echo-server",
		Concurrency:                   256 * 1024,
		DisableHeaderNamesNormalizing: true,
		DisablePreParseMultipartForm:  true,
		NoDefaultServerHeader:         true,
		NoDefaultDate:                 true,
		NoDefaultContentType:          true,
		ReduceMemoryUsage:             false, // Keep false for performance (trades memory for speed)
		GetOnly:                       false,
		ReadBufferSize:                4096,
		WriteBufferSize:               4096,
	}

	// Start server in a goroutine
	go func() {
		if err := server.ListenAndServe(":8080"); err != nil {
			log.Fatalf("Error starting server: %v", err)
		}
	}()

	log.Println("Server started on :8080")

	// Wait for termination signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Gracefully shutdown: stop accepting new connections and wait for existing ones to finish
	if err := server.Shutdown(); err != nil {
		log.Fatalf("Error during server shutdown: %v", err)
	}

	log.Println("Server stopped gracefully")
}
