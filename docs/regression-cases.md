# Regression cases

Prepared for this change. **Not executed.** Tests, manual checks, lint and builds require explicit user authorization. Use isolated fixtures; never run destructive cases against production.

| Case | Input or setup | Expected outcome |
| --- | --- | --- |
| Calibration | SENSOR_MIN=0, SENSOR_MAX=0 or nonnumeric calibration | Startup rejects invalid range |
| Command validation | POST /command with command={}, blank string or >1000 characters | 400 without calling Gemini or the relay |
| AI response | Gemini returns malformed JSON, unknown intent or non-string response_text | Safe fallback intent otro; no relay activation |
| Mock shutdown | MOCK_HARDWARE=true; start, await one status tick, stop; start again | One mock timer per start; stop clears timer and HTTP listener |
| Hardware shutdown | Disconnect the real board and close the server after it was ready | Pump marked off; sensor polling disabled and serial transport closed |
| Static files | Request /server.js or /.env | 404; only public/ assets are served |
| API failure | Gemini rejects request or status polling fails repeatedly | Command displays an error; polling does not overlap or append repeated offline messages |

## Additional cases (not executed)

| Case | Input or setup | Expected outcome |
| --- | --- | --- |
| Shutdown lifecycle | Call stopServer twice while a command or board initialization is pending | Both callers await one shutdown; hardware stays off; restart during shutdown is rejected |
