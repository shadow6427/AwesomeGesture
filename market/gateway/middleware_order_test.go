package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func composedGatewayMiddlewareForTest(next http.Handler) http.Handler {
	handler := next
	handler = MetricsMiddleware(handler)
	handler = RateLimitMiddleware(0, 1)(handler)
	handler = AuthMiddleware(handler)
	handler = SecurityHeadersMiddleware(handler)
	handler = LoggingMiddleware(handler)
	handler = CORSMiddleware([]string{"https://app.example"}, time.Minute)(handler)
	handler = RequestIDMiddleware(handler)
	handler = RecoveryMiddleware(handler)
	return handler
}

func requestForMiddlewareOrderTest(token string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/market/orderbook", nil)
	req.RemoteAddr = "198.51.100.7:43000"
	req.Header.Set("Origin", "https://app.example")
	req.Header.Set("X-Request-ID", "req-middleware-order")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

func TestComposedGatewayMiddlewareOrder(t *testing.T) {
	tests := []struct {
		name             string
		run              func(t *testing.T, handler http.Handler, hits *int) []int
		expectedHits     int
		expectedStatuses []int
	}{
		{
			name: "authenticated request reaches handler with auth context before rate limiting",
			run: func(t *testing.T, handler http.Handler, hits *int) []int {
				rec := httptest.NewRecorder()
				handler.ServeHTTP(rec, requestForMiddlewareOrderTest("valid-token"))

				if rec.Code != http.StatusOK {
					t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
				}
				if got := rec.Header().Get("X-Request-ID"); got != "req-middleware-order" {
					t.Fatalf("X-Request-ID = %q, want request header to be preserved", got)
				}
				if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example" {
					t.Fatalf("Access-Control-Allow-Origin = %q", got)
				}
				if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
					t.Fatalf("security header X-Content-Type-Options = %q", got)
				}
				return []int{rec.Code}
			},
			expectedHits:     1,
			expectedStatuses: []int{http.StatusOK},
		},
		{
			name: "unauthenticated request returns 401 without consuming authenticated budget",
			run: func(t *testing.T, handler http.Handler, hits *int) []int {
				unauthenticated := httptest.NewRecorder()
				handler.ServeHTTP(unauthenticated, requestForMiddlewareOrderTest(""))
				if unauthenticated.Code != http.StatusUnauthorized {
					t.Fatalf("unauthenticated status = %d, want %d", unauthenticated.Code, http.StatusUnauthorized)
				}
				if unauthenticated.Header().Get("X-RateLimit-Limit") != "" {
					t.Fatalf("unauthenticated request reached rate limiter headers: %v", unauthenticated.Header())
				}

				authenticated := httptest.NewRecorder()
				handler.ServeHTTP(authenticated, requestForMiddlewareOrderTest("valid-token"))
				if authenticated.Code != http.StatusOK {
					t.Fatalf("authenticated status after unauthenticated attempt = %d, want %d; body=%s", authenticated.Code, http.StatusOK, authenticated.Body.String())
				}
				return []int{unauthenticated.Code, authenticated.Code}
			},
			expectedHits:     1,
			expectedStatuses: []int{http.StatusUnauthorized, http.StatusOK},
		},
		{
			name: "repeated authenticated requests exhaust rate limit with JSON error",
			run: func(t *testing.T, handler http.Handler, hits *int) []int {
				first := httptest.NewRecorder()
				handler.ServeHTTP(first, requestForMiddlewareOrderTest("valid-token"))
				if first.Code != http.StatusOK {
					t.Fatalf("first authenticated status = %d, want %d", first.Code, http.StatusOK)
				}

				second := httptest.NewRecorder()
				handler.ServeHTTP(second, requestForMiddlewareOrderTest("valid-token"))
				if second.Code != http.StatusTooManyRequests {
					t.Fatalf("second authenticated status = %d, want %d; body=%s", second.Code, http.StatusTooManyRequests, second.Body.String())
				}

				var body map[string]any
				if err := json.Unmarshal(second.Body.Bytes(), &body); err != nil {
					t.Fatalf("rate limit response is not JSON: %v", err)
				}
				if got := body["error"]; got != "rate_limit_exceeded" {
					t.Fatalf("rate limit error = %v, want rate_limit_exceeded", got)
				}
				if message, ok := body["message"].(string); !ok || !strings.Contains(message, "Too many requests") {
					t.Fatalf("rate limit message = %v", body["message"])
				}
				return []int{first.Code, second.Code}
			},
			expectedHits:     1,
			expectedStatuses: []int{http.StatusOK, http.StatusTooManyRequests},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hits := 0
			handler := composedGatewayMiddlewareForTest(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				userID, userOK := r.Context().Value(ContextKeyUserID).(string)
				sessionID, sessionOK := r.Context().Value(ContextKeySessionID).(string)
				authMethod, methodOK := r.Context().Value(ContextKeyAuthMethod).(string)
				if !userOK || userID != "user_stub" || !sessionOK || sessionID != "session_stub" || !methodOK || authMethod != "bearer" {
					t.Fatalf("handler reached without authenticated context: user=%v session=%v method=%v", userID, sessionID, authMethod)
				}
				hits++
				writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
			}))

			statuses := tt.run(t, handler, &hits)

			if hits != tt.expectedHits {
				t.Fatalf("handler hits = %d, want %d", hits, tt.expectedHits)
			}
			if len(statuses) != len(tt.expectedStatuses) {
				t.Fatalf("statuses = %v, want %v", statuses, tt.expectedStatuses)
			}
			for i := range statuses {
				if statuses[i] != tt.expectedStatuses[i] {
					t.Fatalf("statuses = %v, want %v", statuses, tt.expectedStatuses)
				}
			}
		})
	}
}
