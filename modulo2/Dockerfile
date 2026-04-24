# go-service/Dockerfile
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY main.go ./
RUN go build -o server main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 3000
CMD ["./server"]