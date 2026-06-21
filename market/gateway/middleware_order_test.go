package gateway

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func composedGatewayTestHandler(t *testing.T, ratePerSecond float64, burst int, calls *[]string) http.Handler {
	t.Helper()

	final := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls = append(*calls, "handler")

		if got := r.Context().Value(ContextKeyUserID); got != "user_stub" {
			t.Fatalf("handler saw user context %v, want user_stub", got)
		}
		if got := r.Context().Value(ContextKeySessionID); got != "session_stub" {
			t.Fatalf("handler saw session context %v, want session_stub", got)
		}
		if got := r.Context().Value(ContextKeyAuthMethod); got != "bearer" {
			t.Fatalf("handler saw auth method %v, want bearer", got)
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	rateLimited := RateLimitMiddleware(ratePerSecond, burst)(final)
	withRateLimit := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls = append(*calls, "rate_limit")
		rateLimited.ServeHTTP(w, r)
	})

	withAuth := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls = append(*calls, "auth")
		AuthMiddleware(withRateLimit).ServeHTTP(w, r)
	})

	return RecoveryMiddleware(
		RequestIDMiddleware(
			LoggingMiddleware(
				CORSMiddleware([]string{"https://client.example"}, time.Minute)(
					MetricsMiddleware(withAuth),
				),
			),
		),
	)
}

func serveGatewayMiddlewareRequest(handler http.Handler, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/market/orderbook", nil)
	req.RemoteAddr = "203.0.113.10:4242"
	req.Header.Set("Origin", "https://client.example")
	req.Header.Set("X-Request-ID", "request-test-id")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func decodeGatewayMiddlewareBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()

	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response body is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

func TestComposedGatewayMiddlewareOrder(t *testing.T) {
	t.Run("authenticated request is enriched before rate limiting reaches handler", func(t *testing.T) {
		var calls []string
		var logs bytes.Buffer
		previousOutput := log.Writer()
		log.SetOutput(&logs)
		defer log.SetOutput(previousOutput)

		handler := composedGatewayTestHandler(t, 0.001, 1, &calls)
		rec := serveGatewayMiddlewareRequest(handler, "token-1")

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
		}
		if got := strings.Join(calls, ","); got != "auth,rate_limit,handler" {
			t.Fatalf("middleware calls = %s, want auth,rate_limit,handler", got)
		}
		if got := rec.Header().Get("X-Request-ID"); got != "request-test-id" {
			t.Fatalf("request id header = %q, want request-test-id", got)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://client.example" {
			t.Fatalf("CORS origin = %q, want https://client.example", got)
		}
		if got := rec.Header().Get("X-RateLimit-Remaining"); got != "0" {
			t.Fatalf("remaining rate limit = %q, want 0 after first authenticated request", got)
		}
		if got := logs.String(); !strings.Contains(got, "GET /api/v1/market/orderbook 200") {
			t.Fatalf("request log %q does not include successful request", got)
		}
	})

	t.Run("unauthenticated requests do not consume authenticated budget", func(t *testing.T) {
		var calls []string
		handler := composedGatewayTestHandler(t, 0.001, 1, &calls)

		for i := 0; i < 3; i++ {
			rec := serveGatewayMiddlewareRequest(handler, "")
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("unauthenticated request %d status = %d, want 401", i+1, rec.Code)
			}
			body := decodeGatewayMiddlewareBody(t, rec)
			if body["error"] != "unauthorized" {
				t.Fatalf("unauthenticated request %d error = %v, want unauthorized", i+1, body["error"])
			}
			if rec.Header().Get("X-RateLimit-Remaining") != "" {
				t.Fatalf("unauthenticated request %d unexpectedly received rate limit headers", i+1)
			}
		}

		rec := serveGatewayMiddlewareRequest(handler, "token-1")
		if rec.Code != http.StatusOK {
			t.Fatalf("authenticated status after unauthenticated traffic = %d, want 200; body: %s", rec.Code, rec.Body.String())
		}
		if got := strings.Count(strings.Join(calls, ","), "rate_limit"); got != 1 {
			t.Fatalf("rate limit call count = %d, want only the authenticated request to reach rate limiting", got)
		}
	})

	t.Run("repeated authenticated requests exhaust budget with JSON 429", func(t *testing.T) {
		var calls []string
		handler := composedGatewayTestHandler(t, 0.001, 1, &calls)

		first := serveGatewayMiddlewareRequest(handler, "token-1")
		if first.Code != http.StatusOK {
			t.Fatalf("first authenticated status = %d, want 200", first.Code)
		}

		second := serveGatewayMiddlewareRequest(handler, "token-1")
		if second.Code != http.StatusTooManyRequests {
			t.Fatalf("second authenticated status = %d, want 429; body: %s", second.Code, second.Body.String())
		}
		body := decodeGatewayMiddlewareBody(t, second)
		if body["error"] != "rate_limit_exceeded" {
			t.Fatalf("rate limit error = %v, want rate_limit_exceeded", body["error"])
		}
		if _, ok := body["retry_after"]; !ok {
			t.Fatalf("rate limit response missing retry_after: %#v", body)
		}
		if got := second.Header().Get("X-RateLimit-Limit"); got != "1" {
			t.Fatalf("rate limit header = %q, want 1", got)
		}
	})
}
