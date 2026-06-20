package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestMiddlewareOrdering(t *testing.T) {
	// Create a composed middleware chain
	// Order: Panic -> RequestID -> Logging -> CORS -> Auth -> RateLimit -> Metrics -> SecurityHeaders -> Timeout -> Handler
	// Actually, the comment says:
	//   1. Panic recovery (outermost)
	//   2. Request ID generation
	//   3. Request logging
	//   4. CORS headers
	//   5. Authentication
	//   6. Rate limiting
	//   7. Metrics collection
	//   8. Request context enrichment
	//   9. Actual handler (innermost)

	rateLimitRate := 10.0 // 10 tokens per second
	rateLimitBurst := 2   // burst of 2

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := r.Context().Value(ContextKeyUserID)
		if userID != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "user": userID})
		} else {
			writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok"})
		}
	})

	// Wrap in reverse order
	// Assuming Metrics is just MetricsMiddleware
	chain := MetricsMiddleware(handler)
	chain = RateLimitMiddleware(rateLimitRate, rateLimitBurst)(chain)
	chain = AuthMiddleware(chain)
	chain = CORSMiddleware([]string{"*"}, time.Hour)(chain)
	chain = LoggingMiddleware(chain)
	chain = RequestIDMiddleware(chain)
	chain = RecoveryMiddleware(chain)

	t.Run("Authenticated request reaches handler before rate limit", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer valid-token")
		req.RemoteAddr = "1.2.3.4:1234"
		
		rec := httptest.NewRecorder()
		chain.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200 OK, got %d", rec.Code)
		}
		var resp map[string]interface{}
		json.NewDecoder(rec.Body).Decode(&resp)
		if resp["user"] != "user_stub" {
			t.Errorf("expected user to be populated in context")
		}
		
		// Check that rate limit headers are present (meaning RateLimitMiddleware ran)
		if rec.Header().Get("X-RateLimit-Limit") == "" {
			t.Errorf("expected rate limit headers")
		}
	})

	t.Run("Unauthenticated request returns 401 and does not affect rate limit", func(t *testing.T) {
		// First, send an unauthenticated request from IP 2.3.4.5
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "2.3.4.5:1234"
		rec := httptest.NewRecorder()
		chain.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 Unauthorized, got %d", rec.Code)
		}
		
		// Check that rate limit headers are NOT present (Auth rejected before RateLimit)
		if rec.Header().Get("X-RateLimit-Limit") != "" {
			t.Errorf("expected no rate limit headers for unauthenticated request")
		}
	})

	t.Run("Repeated authenticated requests hit 429 rate limit", func(t *testing.T) {
		// Burst is 2, so 3rd request should fail if done immediately
		ip := "3.4.5.6:1234"
		for i := 0; i < 2; i++ {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Authorization", "Bearer valid-token")
			req.RemoteAddr = ip
			rec := httptest.NewRecorder()
			chain.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200 OK on request %d, got %d", i+1, rec.Code)
			}
		}

		// 3rd request should be rate limited
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer valid-token")
		req.RemoteAddr = ip
		rec := httptest.NewRecorder()
		chain.ServeHTTP(rec, req)

		if rec.Code != http.StatusTooManyRequests {
			t.Errorf("expected 429 Too Many Requests, got %d", rec.Code)
		}

		var resp map[string]interface{}
		json.NewDecoder(rec.Body).Decode(&resp)
		if resp["error"] != "rate_limit_exceeded" {
			t.Errorf("expected rate_limit_exceeded error, got %v", resp["error"])
		}
	})
}
