package ws

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/tent-of-trials/market/matching"
	"go.uber.org/zap"
)

func TestWebSocketValidation(t *testing.T) {
	logger := zap.NewNop()
	hub := NewHub(logger)
	go hub.Run()
	engine := matching.NewMatchingEngine(matching.EngineConfig{}, nil)
	server := NewServer(hub, engine, logger, 8080)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", server.handleWebSocket)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	ws, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer ws.Close()

	cases := []struct {
		name     string
		msg      string
		wantCode int
		wantFld  string
	}{
		{
			name:     "invalid json",
			msg:      `{bad json`,
			wantCode: 4001,
		},
		{
			name:     "unknown type",
			msg:      `{"type": "foo", "symbol": "BTC-USD"}`,
			wantCode: 4001,
			wantFld:  "type",
		},
		{
			name:     "bad symbol",
			msg:      `{"type": "subscribe", "symbol": "BTC"}`,
			wantCode: 4001,
			wantFld:  "symbol",
		},
		{
			name:     "valid subscribe",
			msg:      `{"type": "subscribe", "symbol": "BTC-USD"}`,
			wantCode: 0,
		},
		{
			name:     "duplicate subscribe",
			msg:      `{"type": "subscribe", "symbol": "BTC-USD"}`,
			wantCode: 4001,
			wantFld:  "symbol",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := ws.WriteMessage(websocket.TextMessage, []byte(tc.msg)); err != nil {
				t.Fatalf("Write failed: %v", err)
			}
			if tc.wantCode == 0 {
				time.Sleep(50 * time.Millisecond) // Give it time to process
				return
			}
			ws.SetReadDeadline(time.Now().Add(1 * time.Second))
			_, p, err := ws.ReadMessage()
			if err != nil {
				t.Fatalf("Read failed: %v", err)
			}
			var resp map[string]interface{}
			if err := json.Unmarshal(p, &resp); err != nil {
				t.Fatalf("Bad response JSON: %v", err)
			}
			code := int(resp["code"].(float64))
			if code != tc.wantCode {
				t.Errorf("Expected code %d, got %d", tc.wantCode, code)
			}
			if tc.wantFld != "" {
				details, ok := resp["details"].(map[string]interface{})
				if !ok {
					t.Fatalf("Expected details object")
				}
				field := details["field"].(string)
				if field != tc.wantFld {
					t.Errorf("Expected field %s, got %s", tc.wantFld, field)
				}
			}
		})
	}
}
