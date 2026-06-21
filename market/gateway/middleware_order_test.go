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

// composedGatewayTestHandler builds the full middleware chain for testing.
// ratePerSecond and burst control the token bucket for the rate limiter.
// calls accumulates the order in which middleware executed.
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

func serveGatewayMiddlewareReq(handler http.Handler, token string) *httptest.ResponseRecorder {
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

func decodeGatewayBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response body is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

// TestComposedGatewayMiddlewareOrder verifies the full middleware chain
// ordering via table-driven tests. The chain must apply:
//
//	Recovery → RequestID → Logging → CORS → Auth → RateLimit → Metrics → Handler
//
// These tests ensure authentication runs before rate limiting,
// unauthenticated traffic is rejected without consuming budget,
// and repeated authenticated requests eventually get rate-limited.
func TestComposedGatewayMiddlewareOrder(t *testing.T) {
	type reqStep struct {
		token string
	}
	type testCase struct {
		name         string
		ratePerSec   float64
		burst        int
		steps        []reqStep
		verifyLastFn func(t *testing.T, rec *httptest.ResponseRecorder, allCalls []string, logs string)
	}

	tests := []testCase{
		{
			name:       "authenticated request reaches handler with user context before rate limiting",
			ratePerSec: 0.001,
			burst:      1,
			steps:      []reqStep{{token: "token-1"}},
			verifyLastFn: func(t *testing.T, rec *httptest.ResponseRecorder, allCalls []string, logs string) {
				if rec.Code != http.StatusOK {
					t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
				}
				if got := strings.Join(allCalls, ","); got != "auth,rate_limit,handler" {
					t.Fatalf("middleware calls = %s, want auth,rate_limit,handler", got)
				}
				if got := rec.Header().Get("X-Request-ID"); got != "request-test-id" {
					t.Errorf("request id header = %q, want request-test-id", got)
				}
				if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://client.example" {
					t.Errorf("CORS origin = %q, want https://client.example", got)
				}
				if got := rec.Header().Get("X-RateLimit-Remaining"); got != "0" {
					t.Errorf("remaining rate limit = %q, want 0 after first authenticated request", got)
				}
				if !strings.Contains(logs, "GET /api/v1/market/orderbook 200") {
					t.Errorf("request log %q does not include successful request", logs)
				}
			},
		},
		{
			name:       "unauthenticated requests do not consume authenticated rate-limit budget",
			ratePerSec: 0.001,
			burst:      1,
			steps:      []reqStep{{token: ""}, {token: ""}, {token: ""}, {token: "token-1"}},
			verifyLastFn: func(t *testing.T, rec *httptest.ResponseRecorder, allCalls []string, logs string) {
				// Last request should succeed (authenticated)
				if rec.Code != http.StatusOK {
					t.Fatalf("last authenticated request status = %d, want 200; body: %s", rec.Code, rec.Body.String())
				}
				// rate_limit should only have been called once (for the authenticated request)
				if got := strings.Count(strings.Join(allCalls, ","), "rate_limit"); got != 1 {
					t.Errorf("rate limit call count = %d, want only the authenticated request to reach rate limiting", got)
				}
			},
		},
		{
			name:       "repeated authenticated requests exhaust budget with JSON 429",
			ratePerSec: 0.001,
			burst:      1,
			steps:      []reqStep{{token: "token-1"}, {token: "token-1"}},
			verifyLastFn: func(t *testing.T, rec *httptest.ResponseRecorder, allCalls []string, logs string) {
				if rec.Code != http.StatusTooManyRequests {
					t.Fatalf("second authenticated status = %d, want 429; body: %s", rec.Code, rec.Body.String())
				}
				body := decodeGatewayBody(t, rec)
				if body["error"] != "rate_limit_exceeded" {
					t.Errorf("rate limit error = %v, want rate_limit_exceeded", body["error"])
				}
				if _, ok := body["retry_after"]; !ok {
					t.Errorf("rate limit response missing retry_after: %#v", body)
				}
				if got := rec.Header().Get("X-RateLimit-Limit"); got != "1" {
					t.Errorf("rate limit header = %q, want 1", got)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var allCalls []string
			var logs bytes.Buffer
			prevOutput := log.Writer()
			log.SetOutput(&logs)
			defer log.SetOutput(prevOutput)

			handler := composedGatewayTestHandler(t, tt.ratePerSec, tt.burst, &allCalls)

			var lastRec *httptest.ResponseRecorder

			for i, step := range tt.steps {
				rec := serveGatewayMiddlewareReq(handler, step.token)
				lastRec = rec

				// For unauthenticated steps in the middle of a sequence,
				// verify they are rejected without rate-limit propagation.
				if step.token == "" {
					if rec.Code != http.StatusUnauthorized {
						t.Fatalf("unauthenticated request %d status = %d, want 401", i+1, rec.Code)
					}
					body := decodeGatewayBody(t, rec)
					if body["error"] != "unauthorized" {
						t.Fatalf("unauthenticated request %d error = %v, want unauthorized", i+1, body["error"])
					}
					if rec.Header().Get("X-RateLimit-Remaining") != "" {
						t.Fatalf("unauthenticated request %d unexpectedly received rate limit headers", i+1)
					}
				}
			}

			tt.verifyLastFn(t, lastRec, allCalls, logs.String())
		})
	}
}
